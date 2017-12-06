'use strict';

var _ = require('lodash')
  , utils = require('./utils')
  , objection = require('objection')
  , graphqlRoot = require('graphql')
  , jsonSchemaUtils = require('./jsonSchema')
  , defaultArgFactories = require('./argFactories')
  , GraphQLObjectType = graphqlRoot.GraphQLObjectType
  , GraphQLSchema = graphqlRoot.GraphQLSchema
  , GraphQLList = graphqlRoot.GraphQLList
  , pluralize = require('pluralize');

// Default arguments that are excluded from the relation arguments.
const OMIT_FROM_RELATION_ARGS = [
  // We cannot use `range` in the relation arguments since the relations are fetched
  // for multiple objects at a time. Limiting the result set would limit the combined
  // result, and not the individual model's relation.
  "range"
];

const GRAPHQL_META_FIELDS = [
  "__typename"
];

// GraphQL AST node types.
const KIND_FRAGMENT_SPREAD = 'FragmentSpread';
const KIND_VARIABLE = 'Variable';

class SchemaBuilder {

  constructor() {
    this.models = {};
    this.typeCache = {};
    this.filterIndex = 1;
    this.argFactories = [];
    this.enableSelectFiltering = true;
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
    this.defaultArgNameMap = Object.assign({}, this.defaultArgNameMap, defaultArgNameMap);
    return this;
  }

  argFactory(argFactory) {
    this.argFactories.push(argFactory);
    return this;
  }

  selectFiltering(enable) {
    this.enableSelectFiltering = !!enable;
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
            const listFieldName = modelData.opt.listFieldName || pluralize(defaultFieldName);

            fields[singleFieldName] = this._rootQuerySingleField(modelData);
            fields[listFieldName] = this._rootQueryListField(modelData);
          });
          return fields;
        }
      }),
      mutation: newGraphQLObjectType({
        name: 'Mutation',
        fields: () => {
          const fields = {};
          _.forOwn(this.models, (modelData) => {
            const defaultFieldName = fieldNameForModel(modelData.modelClass);
            const singleFieldName = modelData.opt.fieldName || defaultFieldName;
            const listFieldName = modelData.opt.listFieldName || pluralize(defaultFieldName);
            fields['create' + _.upperFirst(singleFieldName)] = this._rootMutationSingleField(modelData, 'create');
            fields['update' + _.upperFirst(singleFieldName)] = this._rootMutationSingleField(modelData, 'update');
            fields['patch' + _.upperFirst(singleFieldName)] = this._rootMutationSingleField(modelData, 'patch');
            fields['delete' + _.upperFirst(singleFieldName)] = this._rootMutationSingleField(modelData, 'delete');
            // fields[listFieldName] = this._rootMutationListField(modelData);
          });

          return fields;
        }
      })
    });
  };

  _argsForModel(modelData) {
    const factories = defaultArgFactories(this.defaultArgNameMap, {typeCache: this.typeCache}).concat(this.argFactories);

    return factories.reduce((args, factory) => {
      return Object.assign(args, factory(modelData.fields, modelData.modelClass));
    }, {});
  }

  _rootQuerySingleField(modelData) {
    return {
      type: this._typeForModel(modelData),
      args: modelData.args,
      resolve: this._resolverForQuery(modelData, (query) => {
        query.first();
      })
    };
  }

  _rootQueryListField(modelData) {
    return {
      type: new GraphQLList(this._typeForModel(modelData)),
      args: modelData.args,
      resolve: this._resolverForQuery(modelData)
    };
  }
  _rootMutationSingleField(modelData, mode) {
    return {
      type: this._typeForModel(modelData),
      args: modelData.args,
      resolve: this._resolverForMutation(modelData, mode)
    };
  }

  _typeForModel(modelData) {
    const typeName = utils.typeNameForModel(modelData.modelClass);

    if (!this.typeCache[typeName]) {
      this.typeCache[typeName] = new GraphQLObjectType({
        name: typeName,
        fields: () => {
          return Object.assign({},
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
        // If the relation model has not been given for the builder using `model()` method
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
        args: _.omit(modelData.args, OMIT_FROM_RELATION_ARGS)
      };
    } else if (relation instanceof objection.HasManyRelation || relation instanceof objection.ManyToManyRelation) {
      return {
        type: new GraphQLList(this._typeForModel(modelData)),
        args: _.omit(modelData.args, OMIT_FROM_RELATION_ARGS)
      };
    } else {
      throw new Error(`relation type "${relation.constructor.name}" is not supported`);
    }
  }

  _resolverForQuery(modelData, extraQuery) {
    return (ctx, ignore1, ignore2, data) => {
      ctx = ctx || {};

      const modelClass = modelData.modelClass;
      const ast = (data.fieldASTs || data.fieldNodes)[0];
      const eager = this._buildEager(ast, modelClass, data);
      const argFilter = this._filterForArgs(ast, modelClass, data.variableValues);
      const selectFilter = this._filterForSelects(ast, modelClass, data);
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
  // Mutations
  _resolverForMutation(modelData, mode) {
    return (ctx, ignore1, ignore2, data) => {
      ctx = ctx || {};
      const modelClass = modelData.modelClass;
      const ast = (data.fieldASTs || data.fieldNodes)[0];
      const eager = this._buildEager(ast, modelClass, data);
      const argFilter = this._filterForMutationArgs(ast, modelClass, data.variableValues, mode);

      const builder = modelClass.query(ctx.knex);
      
      if (ctx.onQuery) {
        ctx.onQuery(builder, ctx);
      }
      if (argFilter) {
        builder.modify(argFilter);
      }

      if (eager.expression) {
        builder.eager(eager.expression, eager.filters);
      }

      return builder.then(toJson);
    };
  }

  _buildEager(astNode, modelClass, astRoot) {
    const eagerExpr = this._buildEagerSegment(astNode, modelClass, astRoot);

    if (eagerExpr.expression.length) {
      eagerExpr.expression = `[${eagerExpr.expression}]`;
    }

    return eagerExpr;
  }

  _buildEagerSegment(astNode, modelClass, astRoot) {
    const filters = {};
    const relations = modelClass.getRelations();
    let expression = '';

    for (let i = 0, l = astNode.selectionSet.selections.length; i < l; ++i) {
      const selectionNode = astNode.selectionSet.selections[i];
      const relation = relations[selectionNode.name.value];

      if (relation) {
        expression = this._buildEagerRelationSegment(selectionNode, relation, expression, filters, astRoot);
      } else if (selectionNode.kind === KIND_FRAGMENT_SPREAD) {
        expression = this._buildEagerFragmentSegment(selectionNode, modelClass, expression, filters, astRoot);
      }
    }

    return {
      expression,
      filters
    };
  }

  _buildEagerRelationSegment(selectionNode, relation, expression, filters, astRoot) {
    let relExpr = selectionNode.name.value;

    const selectFilter = this._filterForSelects(selectionNode, relation.relatedModelClass, astRoot);
    const filterNames = [];

    if (selectFilter) {
      const filterName = `s${this.filterIndex++}`;

      filterNames.push(filterName);
      filters[filterName] = selectFilter;
    }

    if (selectionNode.arguments.length) {
      const argFilter = this._filterForArgs(selectionNode, relation.relatedModelClass, astRoot.variableValues);

      if (argFilter) {
        const filterName = `f${this.filterIndex++}`;

        filterNames.push(filterName);
        filters[filterName] = argFilter;
      }
    }

    if (filterNames.length) {
      relExpr += `(${filterNames.join(', ')})`;
    }

    const subExpr = this._buildEager(selectionNode, relation.relatedModelClass, astRoot);

    if (subExpr.expression.length) {
      relExpr += `.${subExpr.expression}`;
      Object.assign(filters, subExpr.filters);
    }

    if (expression.length) {
      expression += ', ';
    }

    return expression + relExpr;
  }

  _buildEagerFragmentSegment(selectionNode, modelClass, expression, filters, astRoot) {
    const fragmentSelection = astRoot.fragments[selectionNode.name.value];
    const fragmentExpr = this._buildEagerSegment(fragmentSelection, modelClass, astRoot);
    let fragmentExprString = '';

    if (fragmentExpr.expression.length) {
      fragmentExprString += fragmentExpr.expression;
      Object.assign(filters, fragmentExpr.filters);
    }

    if (expression.length) {
      expression += ', ';
    }

    return expression + fragmentExprString;
  }

  _filterForArgs(astNode, modelClass, variables) {
    const args = astNode.arguments;

    if (args.length === 0) {
      return null;
    }

    const modelData = this.models[modelClass.tableName];
    const argObjects = new Array(args.length);

    for (let i = 0, l = args.length; i < l; ++i) {
      const arg = args[i];

      const value = this._argValue(arg.value, variables);

      argObjects[i] = {
        name: arg.name.value,
        value
      };
    }

    return (builder) => {
      for (let i = 0, l = argObjects.length; i < l; ++i) {
        const arg = argObjects[i];
        modelData.args[arg.name].query(builder, arg.value);
      }
    };
  }

  _filterForMutationArgs(astNode, modelClass, variables, recordMode) {
    const args = astNode.arguments;

    if (args.length === 0) {
      return null;
    }

    const modelData = this.models[modelClass.tableName];
    const argObjects = [];
    var argFilters = [];
    var idColumnValue = 0;
    const jsonSchema = modelClass.jsonSchema;

    for (let i = 0, l = args.length; i < l; ++i) {
      const arg = args[i];
    const value = this._argValue(arg.value, variables);

      if (arg.name.value === 'idEq') {
        idColumnValue = value
      }
      if (jsonSchema.properties[arg.name.value]) {
        argObjects.push([   // Save as array object for Mutation
          arg.name.value,
          value
        ]);
      } else {              // Save as Object for Query 
        argFilters.push({
      name: arg.name.value,
      value
        });
      }
    }

    var argUpdates = argObjects.reduce(function(pv, cv) {
      pv[cv[0]] = cv[1];
      return pv;
    }, {});    
  
    return (builder) => {
      switch (recordMode) {
      case 'create': 
        builder.insertAndFetch(argUpdates);
        break;
      case 'update': 
        builder.updateAndFetchById(idColumnValue, argUpdates);
        break;
      case 'patch': 
        builder.patchAndFetchById(idColumnValue, argUpdates);
        break
      case 'delete': 
        builder.delete();
        break;
      default:
        throw new Error(`objection-graphql cannot handle mutation mode ${mode}`);
      }

      for (let i = 0, l = argFilters.length; i < l; ++i) {
        const argFilter = argFilters[i];

        modelData.args[argFilter.name].query(builder, argFilter.value);
      }
    };
  }

  _argValue(value, variables) {
    if (value.kind === KIND_VARIABLE) {
      return variables[value.name.value];
    } else if ('value' in value) {
      return value.value;
    } else if (Array.isArray(value.values)) {
      return value.values.map(value => this._argValue(value, variables));
    } else {
      throw new Error(`objection-graphql cannot handle argument value ${JSON.stringify(value)}`);
    }
  }

  _filterForSelects(astNode, modelClass, astRoot) {
    if (!this.enableSelectFiltering) {
      return null;
    }

    const relations = modelClass.getRelations();
    const selects = this._collectSelects(astNode, relations, astRoot.fragments, []);

    if (selects.length === 0) {
      return null;
    }

    return (builder) => {
      const jsonSchema = modelClass.jsonSchema;

      builder.select(selects.map(it => {
        const col = modelClass.propertyNameToColumnName(it);

        if (jsonSchema.properties[it]) {
          return `${builder.tableRefFor(modelClass)}.${col}`;
        } else {
          return col;
        }
      }));
    };
  }

  _filterForMutations(astNode, modelClass, astRoot) {
    // if (!this.enableSelectFiltering) {
    //   return null;
    // }

    const relations = modelClass.getRelations();
    const updates = this._collectUpdates(astNode, relations, astRoot.fragments, []); 

    const variables = astRoot.variableValues;
    const args = astNode.arguments;
    if (updates.length === 0) {
      return null;
    }

    return (builder) => {
      const jsonSchema = modelClass.jsonSchema;

      builder.select(updates.map(it => {
        const col = modelClass.propertyNameToColumnName(it);

        const modelDataArg = astRoot.variableValues;
        if (jsonSchema.properties[it]) {
          return `${builder.tableRefFor(modelClass)}.${col}`;
        } else {
          return col;
        }
      }));
    };
  }

  _collectSelects(astNode, relations, fragments, selects) {
    for (let i = 0, l = astNode.selectionSet.selections.length; i < l; ++i) {
      const selectionNode = astNode.selectionSet.selections[i];

      if (selectionNode.kind === KIND_FRAGMENT_SPREAD) {
        this._collectSelects(fragments[selectionNode.name.value], relations, fragments, selects);
      } else {
        const relation = relations[selectionNode.name.value];
        const isMetaField = GRAPHQL_META_FIELDS.indexOf(selectionNode.name.value) !== -1;

        if (!relation && !isMetaField) {
          selects.push(selectionNode.name.value);
        }
      }
    }

    return selects;
  }
  _collectUpdates(astNode, relations, fragments, updates) {
    for (let i = 0, l = astNode.selectionSet.selections.length; i < l; ++i) {
      const selectionNode = astNode.selectionSet.selections[i];
      if (selectionNode.kind === KIND_FRAGMENT_SPREAD) {
        this._collectUpdates(fragments[selectionNode.name.value], relations, fragments, updates);
      } else {
        const relation = relations[selectionNode.name.value];
        const isMetaField = GRAPHQL_META_FIELDS.indexOf(selectionNode.name.value) !== -1;
        if (!relation && !isMetaField) {
          updates.push(selectionNode.name.value);
        }
      }
    }
    return updates;
  }
}

function fieldNameForModel(modelClass) {
  return _.camelCase(utils.typeNameForModel(modelClass));
}

function toJson(result) {
  console.warn('JSON result: ', JSON.stringify(result, null, 2));
  if (_.isArray(result)) {
    for (let i = 0, l = result.length; i < l; ++i) {
      result[i] = result[i].$toJson();
    }
  } else if (_.isNumber(+result)) {
      // return as is - number of Rows affected during Mutations
  } else {
    result = result && result.$toJson();
  }

  return result;
}

module.exports = SchemaBuilder;
