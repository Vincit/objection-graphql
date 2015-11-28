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

function SchemaBuilder() {
  this.models = {};
  this.typeCache = {};
  this.filterIndex = 1;
  this.argFactories = [];
  this.defaultArgNameMap = {
    "eq": 'Eq',
    "gt": 'Gt',
    "gte": 'Gte',
    "lt": 'Lt',
    "lte": 'Lte',
    "like": 'Like',
    "likeNoCase": 'LikeNoCase',
    "in": 'In',
    "notIn": 'NotIn',
    "orderBy": 'orderBy',
    "orderByDesc": 'orderByDesc',
    "range": "range"
  };
}

SchemaBuilder.prototype.model = function (modelClass, opt) {
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

SchemaBuilder.prototype.defaultArgNames = function (defaultArgNameMap) {
  this.defaultArgNameMap = defaultArgNameMap;
  return this;
};

SchemaBuilder.prototype.argFactory = function (argFactory) {
  this.argFactories.push(argFactory);
  return this;
};

SchemaBuilder.prototype.build = function () {
  var self = this;

  _.each(this.models, function (modelData) {
    modelData.fields = jsonSchemaUtils.jsonSchemaToGraphQLFields(modelData.modelClass.jsonSchema, {
      include: modelData.opt.include,
      exclude: modelData.opt.exclude,
      typeNamePrefix: utils.typeNameForModel(modelData.modelClass),
      typeCache: self.typeCache
    });
    modelData.args = self._argsForModel(modelData);
  });

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: function () {
        return _.reduce(self.models, function (fields, modelData) {
          var defaultFieldName = fieldNameForModel(modelData.modelClass);
          var singleFieldName = modelData.opt.fieldName || defaultFieldName;
          var listFieldName = modelData.opt.listFieldName || (defaultFieldName + 's');

          fields[singleFieldName] = self._rootSingleField(modelData);
          fields[listFieldName] = self._rootListField(modelData);

          return fields;
        }, {})
      }
    })
  });
};

SchemaBuilder.prototype._argsForModel = function (modelData) {
  var factories = defaultArgFactories(this.defaultArgNameMap, {typeCache: this.typeCache}).concat(this.argFactories);

  return _.reduce(factories, function (args, factory) {
    return _.assign(args, factory(modelData.fields, modelData.modelClass));
  }, {});
};

SchemaBuilder.prototype._rootListField = function (modelData) {
  return {
    type: new GraphQLList(this._typeForModel(modelData)),
    args: modelData.args,
    resolve: this._resolverForModel(modelData)
  };
};

SchemaBuilder.prototype._rootSingleField = function (modelData) {
  return {
    type: this._typeForModel(modelData),
    args: modelData.args,
    resolve: this._resolverForModel(modelData, function (query) {
      query.first();
    })
  };
};

SchemaBuilder.prototype._typeForModel = function (modelData) {
  var self = this;
  var typeName = utils.typeNameForModel(modelData.modelClass);

  if (!this.typeCache[typeName]) {
    this.typeCache[typeName] = new GraphQLObjectType({
      name: typeName,
      fields: function () {
        return _.extend({},
          self._attrFields(modelData),
          self._relationFields(modelData)
        )
      }
    });
  }

  return this.typeCache[typeName];
};

SchemaBuilder.prototype._attrFields = function (modelData) {
  return modelData.fields;
};

SchemaBuilder.prototype._relationFields = function (modelData) {
  var self = this;

  return _.reduce(modelData.modelClass.getRelations(), function (fields, relation) {
    var relationModel = self.models[relation.relatedModelClass.tableName];

    if (!relationModel) {
      // If the relation model has not given for the builder using `model()` method
      // we don't handle the relations that have that class.
      return fields;
    }

    if (utils.isExcluded(relationModel.opt, relation.name)) {
      // If the property by the relation's name has been excluded, skip this relation.
      return fields;
    }

    fields[relation.name] = self._relationField(relationModel, relation);
    return fields;
  }, {})
};

SchemaBuilder.prototype._relationField = function (modelData, relation) {
  if (relation instanceof objection.OneToManyRelation || relation instanceof objection.ManyToManyRelation) {
    return {
      type: new GraphQLList(this._typeForModel(modelData)),
      args: _.omit(modelData.args, omitFromRelationArgs)
    };
  } else if (relation instanceof objection.OneToOneRelation) {
    return {
      type: this._typeForModel(modelData),
      args: _.omit(modelData.args, omitFromRelationArgs)
    };
  } else {
    throw new Error('relation type "' + relation.name + '" is not supported');
  }
};

SchemaBuilder.prototype._resolverForModel = function (modelData, extraQuery) {
  extraQuery = extraQuery || _.noop;
  var self = this;

  return function (knex, ignore, data) {
    var modelClass = modelData.modelClass;

    if (knex) {
      modelClass = modelClass.bindKnex(knex);
    }

    var ast = data.fieldASTs[0];
    var eager = self._buildEager(ast, modelClass);
    var filter = self._filterForArgs(ast.arguments, modelClass);

    return modelClass
      .query()
      .eager(eager.expression, eager.filters)
      .call(filter)
      .call(extraQuery);
  };
};

/**
 * Converts a GraphQL AST tree into an objection.js eager expression.
 *
 * @private
 */
SchemaBuilder.prototype._buildEager = function (astNode, modelClass) {
  var self = this;
  var filters = {};

  var relationSelections = _.filter(astNode.selectionSet.selections, function (selection) {
    // Selections that have their own selection set, are relation selections.
    return !!selection.selectionSet;
  });

  var expressions = _.map(relationSelections, function (selection) {
    var relatedModelClass = modelClass.getRelation(selection.name.value).relatedModelClass;
    var relExpr = selection.name.value;

    if (selection.arguments.length) {
      var filterName = 'f' + self.filterIndex++;
      relExpr += '(' + filterName + ')';
      filters[filterName] = self._filterForArgs(selection.arguments, relatedModelClass);
    }

    var subExpr = self._buildEager(selection, relatedModelClass);

    if (subExpr.expression.length) {
      relExpr += '.' + subExpr.expression;

      _.each(subExpr.filters, function (filter, name) {
        filters[name] = filter;
      });
    }

    return relExpr;
  });

  var expression = '';

  if (!_.isEmpty(relationSelections)) {
    if (relationSelections.length === 1) {
      expression = expressions[0];
    } else  {
      expression = '[' + expressions.join(', ') + ']';
    }
  }

  return {
    expression: expression,
    filters: filters
  };
};

SchemaBuilder.prototype._filterForArgs = function (args, modelClass) {
  var modelData = this.models[modelClass.tableName];

  args = _.map(args, function (arg) {
    return {
      name: arg.name.value,
      value: arg.value.value || _.pluck(arg.value.values, 'value')
    };
  });

  return function (builder) {
    _.each(args, function (arg) {
      modelData.args[arg.name].query(builder, arg.value);
    });
  };
};

function fieldNameForModel(modelClass) {
  return _.camelCase(utils.typeNameForModel(modelClass));
}

module.exports = SchemaBuilder;
