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
    "isNull": 'IsNull',
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

  _.forOwn(this.models, function (modelData) {
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
        var fields = {};

        _.forOwn(self.models, function (modelData) {
          var defaultFieldName = fieldNameForModel(modelData.modelClass);
          var singleFieldName = modelData.opt.fieldName || defaultFieldName;
          var listFieldName = modelData.opt.listFieldName || (defaultFieldName + 's');

          fields[singleFieldName] = self._rootSingleField(modelData);
          fields[listFieldName] = self._rootListField(modelData);
        });

        return fields;
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

SchemaBuilder.prototype._rootSingleField = function (modelData) {
  return {
    type: this._typeForModel(modelData),
    args: modelData.args,
    resolve: this._resolverForModel(modelData, function (query) {
      query.first();
    })
  };
};

SchemaBuilder.prototype._rootListField = function (modelData) {
  return {
    type: new GraphQLList(this._typeForModel(modelData)),
    args: modelData.args,
    resolve: this._resolverForModel(modelData)
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
  var fields = {};

  _.forOwn(modelData.modelClass.getRelations(), function (relation) {
    var relationModel = self.models[relation.relatedModelClass.tableName];

    if (!relationModel) {
      // If the relation model has not given for the builder using `model()` method
      // we don't handle the relations that have that class.
      return;
    }

    if (utils.isExcluded(relationModel.opt, relation.name)) {
      // If the property by the relation's name has been excluded, skip this relation.
      return;
    }

    fields[relation.name] = self._relationField(relationModel, relation);
  });

  return fields;
};

SchemaBuilder.prototype._relationField = function (modelData, relation) {
  if (relation instanceof objection.HasManyRelation || relation instanceof objection.ManyToManyRelation) {
    return {
      type: new GraphQLList(this._typeForModel(modelData)),
      args: _.omit(modelData.args, omitFromRelationArgs)
    };
  } else if (relation instanceof objection.HasOneRelation || objection.BelongsToOneRelation) {
    return {
      type: this._typeForModel(modelData),
      args: _.omit(modelData.args, omitFromRelationArgs)
    };
  } else {
    throw new Error('relation type "' + relation.name + '" is not supported');
  }
};

SchemaBuilder.prototype._resolverForModel = function (modelData, extraQuery) {
  var self = this;

  return function (knex, ignore1, ignore2, data) {
    var modelClass = modelData.modelClass;

    if (knex) {
      modelClass = modelClass.bindKnex(knex);
    }

    var ast = (data.fieldASTs || data.fieldNodes)[0];
    var eager = self._buildEager(ast, modelClass);
    var filter = self._filterForArgs(ast.arguments, modelClass);
    var builder = modelClass.query();

    if (filter) {
      builder.modify(filter);
    }

    if (extraQuery) {
      builder.modify(extraQuery);
    }

    if (eager.expression) {
      builder.eager(eager.expression, eager.filters);
    }

    return builder.then(toJson);
  };
};

/**
 * Converts a GraphQL AST tree into an objection.js eager expression.
 *
 * @private
 */
SchemaBuilder.prototype._buildEager = function (astNode, modelClass) {
  var filters = {};
  var numExpressions = 0;
  var expression = '';

  for (var i = 0, l = astNode.selectionSet.selections.length; i < l; ++i) {
    var selection = astNode.selectionSet.selections[i];
    var relation = modelClass.getRelations()[selection.name.value];

    if (relation) {
      var relExpr = selection.name.value;

      if (selection.arguments.length) {
        var filterName = 'f' + this.filterIndex;
        var filter = this._filterForArgs(selection.arguments, relation.relatedModelClass);

        if (filter) {
          this.filterIndex++;
          relExpr += '(' + filterName + ')';
          filters[filterName] = filter;
        }
      }

      var subExpr = this._buildEager(selection, relation.relatedModelClass);

      if (subExpr.expression.length) {
        relExpr += '.' + subExpr.expression;
        _.assign(filters, subExpr.filters);
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
};

SchemaBuilder.prototype._filterForArgs = function (args, modelClass) {
  if (args.length === 0) {
    return null;
  }

  var modelData = this.models[modelClass.tableName];
  var argObjects = new Array(args.length);

  for (var i = 0, l = args.length; i < l; ++i) {
    var arg = args[i];
    var value;

    if (_.has(arg.value, 'value')) {
      value = arg.value.value;
    } else {
      value = _.map(arg.value.values, 'value')
    }

    argObjects[i] = {
      name: arg.name.value,
      value: value
    };
  }

  return function (builder) {
    for (var i = 0, l = argObjects.length; i < l; ++i) {
      var arg = argObjects[i];
      modelData.args[arg.name].query(builder, arg.value);
    }
  };
};

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
