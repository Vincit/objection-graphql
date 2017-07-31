'use strict';

var _ = require('lodash')
  , utils = require('./utils')
  , objection = require('objection')
  , graphqlRoot = require('graphql')
  , jsonSchemaUtils = require('./jsonSchema')
  , defaultArgFactories = require('./argFactories')
  , GraphQLObjectType = graphqlRoot.GraphQLObjectType
  , GraphQLSchema = graphqlRoot.GraphQLSchema
  , GraphQLList = graphqlRoot.GraphQLList;

// Default arguments that are excluded from the relation arguments.
var omitFromRelationArgs = [
  // We cannot use `range` in the relation arguments since the relations are fetched
  // for multiple objects at a time. Limiting the result set would limit the combined
  // result, and not the individual model's relation.
  "range"
];

class SchemaBuilder {

  constructor() {
    this.models = {};
    this.typeCache = {};
    this.filterIndex = 1;
    this.argFactories = [];
    this._selectFiltering = true;
    this.defaultArgNameMap = {
      "eq": 'Eq',
      "gt": 'Gt',
      "gte": 'Gte',
      "lt": 'Lt',
      "lte": 'Lte',
      "like": 'Like',
      "isNull": 'IsNull',
      "likeNoCase": 'LikeNoCase',
      "in": 'In',
      "notIn": 'NotIn',
      "orderBy": 'orderBy',
      "orderByDesc": 'orderByDesc',
      "range": "range"
    };
  }

  model(modelClass, opt) {
    opt = opt || {};

    if (!modelClass.jsonSchema) {
      throw new Error('modelClass must have a jsonSchema');
    }

    this.models[modelClass.tableName] = {
      modelClass: modelClass,
      fields: null,
      args: null,
      opt: opt
    };

    return this;
  };

  defaultArgNames(defaultArgNameMap) {
    this.defaultArgNameMap = defaultArgNameMap;
    return this;
  }

  argFactory(argFactory) {
    this.argFactories.push(argFactory);
    return this;
  }

  selectFiltering(enable) {
    this._selectFiltering = !!enable;
    return this;
  }

  build() {
    _.forOwn(this.models, modelData => {
      modelData.fields = jsonSchemaUtils.jsonSchemaToGraphQLFields(modelData.modelClass.jsonSchema, {
        include: modelData.opt.include,
        exclude: modelData.opt.exclude,
        typeNamePrefix: utils.typeNameForModel(modelData.modelClass),
        typeCache: this.typeCache
      });

      modelData.args = this._argsForModel(modelData);
    });

    return new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: () => {
          const fields = {};

          _.forOwn(this.models, (modelData) => {
            const defaultFieldName = fieldNameForModel(modelData.modelClass);
            const singleFieldName = modelData.opt.fieldName || defaultFieldName;
            const listFieldName = modelData.opt.listFieldName || (defaultFieldName + 's');

            fields[singleFieldName] = this._rootSingleField(modelData);
            fields[listFieldName] = this._rootListField(modelData);
          });

          return fields;
        }
      })
    });
  };

  _argsForModel(modelData) {
    const factories = defaultArgFactories(this.defaultArgNameMap, {typeCache: this.typeCache}).concat(this.argFactories);

    return _.reduce(factories, (args, factory) => {
      return _.assign(args, factory(modelData.fields, modelData.modelClass));
    }, {});
  }

  _rootSingleField(modelData) {
    return {
      type: this._typeForModel(modelData),
      args: modelData.args,
      resolve: this._resolverForModel(modelData, (query) => {
        query.first();
      })
    };
  }

  _rootListField(modelData) {
    return {
      type: new GraphQLList(this._typeForModel(modelData)),
      args: modelData.args,
      resolve: this._resolverForModel(modelData)
    };
  }

  _typeForModel(modelData) {
    const typeName = utils.typeNameForModel(modelData.modelClass);

    if (!this.typeCache[typeName]) {
      this.typeCache[typeName] = new GraphQLObjectType({
        name: typeName,
        fields: () => {
          return _.extend({},
            this._attrFields(modelData),
            this._relationFields(modelData)
          )
        }
      });
    }

    return this.typeCache[typeName];
  }

  _attrFields(modelData) {
    return modelData.fields;
  }

  _relationFields(modelData) {
    const fields = {};

    _.forOwn(modelData.modelClass.getRelations(), (relation) => {
      const relationModel = this.models[relation.relatedModelClass.tableName];

      if (!relationModel) {
        // If the relation model has not given for the builder using `model()` method
        // we don't handle the relations that have that class.
        return;
      }

      if (utils.isExcluded(relationModel.opt, relation.name)) {
        // If the property by the relation's name has been excluded, skip this relation.
        return;
      }

      fields[relation.name] = this._relationField(relationModel, relation);
    });

    return fields;
  }

  _relationField(modelData, relation) {
    if (relation instanceof objection.HasOneRelation 
        || relation instanceof objection.BelongsToOneRelation 
        || relation instanceof objection.HasOneThroughRelation) {
      return {
        type: this._typeForModel(modelData),
        args: _.omit(modelData.args, omitFromRelationArgs)
      };
    } else if (relation instanceof objection.HasManyRelation || relation instanceof objection.ManyToManyRelation) {
      return {
        type: new GraphQLList(this._typeForModel(modelData)),
        args: _.omit(modelData.args, omitFromRelationArgs)
      };
    } else {
      throw new Error('relation type "' + relation.name + '" is not supported');
    }
  }

  _resolverForModel(modelData, extraQuery) {
    return (ctx, ignore1, ignore2, data) => {
      ctx = ctx || {};

      const modelClass = modelData.modelClass;
      const ast = (data.fieldASTs || data.fieldNodes)[0];
      const eager = this._buildEager(ast, modelClass, data);
      const argFilter = this._filterForArgs(ast, modelClass, data.variableValues);
      const selectFilter = this._filterForSelects(ast, modelClass);
      const builder = modelClass.query(ctx.knex);

      if (ctx.onQuery) {
        ctx.onQuery(builder, ctx);
      }

      if (argFilter) {
        builder.modify(argFilter);
      }

      if (selectFilter) {
        builder.modify(selectFilter);
      }

      if (extraQuery) {
        builder.modify(extraQuery);
      }

      if (eager.expression) {
        builder.eager(eager.expression, eager.filters);
      }

      return builder.then(toJson);
    };
  }

  _buildEager(astNode, modelClass, astRoot) {
    const filters = {};
    const relations = modelClass.getRelations();

    let numExpressions = 0;
    // Needs to be `var` to prevent an optimization bailout because of
    // `Unsupported let compound assignment`.
    var expression = '';

    for (let i = 0, l = astNode.selectionSet.selections.length; i < l; ++i) {
      const selectionNode = astNode.selectionSet.selections[i];
      const relation = relations[selectionNode.name.value];

      if (relation) {
        // Needs to be `var` to prevent an optimization bailout because of
        // `Unsupported let compound assignment`.
        var relExpr = selectionNode.name.value;

        const selectFilter = this._filterForSelects(selectionNode, relation.relatedModelClass);
        const filterNames = [];

        if (selectFilter) {
          const filterName = 's' + (this.filterIndex++);
          filterNames.push(filterName);
          filters[filterName] = selectFilter;
        }

        if (selectionNode.arguments.length) {
          const argFilter = this._filterForArgs(selectionNode, relation.relatedModelClass, astRoot.variableValues);

          if (argFilter) {
            const filterName = 'f' + (this.filterIndex++);
            filterNames.push(filterName);
            filters[filterName] = argFilter;
          }
        }

        if (filterNames.length) {
          relExpr += '(' + filterNames.join(', ') + ')';
        }

        let subExpr = this._buildEager(selectionNode, relation.relatedModelClass, astRoot);

        if (subExpr.expression.length) {
          relExpr += '.' + subExpr.expression;
          Object.assign(filters, subExpr.filters);
        }

        if (expression.length) {
          expression += ', ';
        }

        expression += relExpr;
        ++numExpressions;
      }
    }

    if (numExpressions > 1) {
      expression = '[' + expression + ']';
    }

    return {
      expression: expression,
      filters: filters
    };
  }

  _filterForArgs(astNode, modelClass, variableValues) {
    const args = astNode.arguments;

    if (args.length === 0) {
      return null;
    }

    const modelData = this.models[modelClass.tableName];
    const argObjects = new Array(args.length);

    for (let i = 0, l = args.length; i < l; ++i) {
      const arg = args[i];
      let value;

      if(arg.value.kind === 'Variable') {
        value = variableValues[arg.value.name.value];
      } else if (_.has(arg.value, 'value')) {
        value = arg.value.value;
      } else {
        value = _.map(arg.value.values, 'value')
      }

      argObjects[i] = {
        name: arg.name.value,
        value
      };
    }

    return (builder) => {
      for (var i = 0, l = argObjects.length; i < l; ++i) {
        var arg = argObjects[i];
        modelData.args[arg.name].query(builder, arg.value);
      }
    };
  }

  _filterForSelects(astNode, modelClass) {
    if(!this._selectFiltering) return null;

    const relations = modelClass.getRelations();
    const selects = [];
  
    for (let i = 0, l = astNode.selectionSet.selections.length; i < l; ++i) {
      const selectionNode = astNode.selectionSet.selections[i];
      const relation = relations[selectionNode.name.value];

      if (!relation) {
        selects.push(selectionNode.name.value);
      }
    }
  
    if (selects.length === 0) {
      return null;
    }

    return (builder) => {
      builder.select(selects.map(it => {
        if (modelClass.jsonSchema.properties[it]) {
          return `${builder.tableRefFor(modelClass)}.${it}`;
        } else {
          return it;
        }
      }));
    };
  }
}

function fieldNameForModel(modelClass) {
  return _.camelCase(utils.typeNameForModel(modelClass));
}

function toJson(result) {
  if (_.isArray(result)) {
    for (var i = 0, l = result.length; i < l; ++i) {
      result[i] = result[i].$toJson();
    }
  } else {
    result = result.$toJson();
  }

  return result;
}

module.exports = SchemaBuilder;
