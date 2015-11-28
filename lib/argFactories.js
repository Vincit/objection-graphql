var _ = require('lodash')
  , utils = require('./utils')
  , graphqlRoot = require('graphql')
  , GraphQLInt = graphqlRoot.GraphQLInt
  , GraphQLList = graphqlRoot.GraphQLList
  , GraphQLEnumType = graphqlRoot.GraphQLEnumType;

module.exports = function (argNameMap, opt) {
  return [
    basicOperator('=', ''),
    basicOperator('=', argNameMap["eq"]),
    basicOperator('>', argNameMap["gt"]),
    basicOperator('>=', argNameMap["gte"]),
    basicOperator('<', argNameMap["lt"]),
    basicOperator('<=', argNameMap["lte"]),
    basicOperator('like', argNameMap["like"]),
    whereIn('whereIn', argNameMap["in"]),
    whereIn('whereNotIn', argNameMap["notIn"]),
    likeNoCase(argNameMap["likeNoCase"]),
    orderBy(argNameMap["orderBy"], 'asc', opt.typeCache),
    orderBy(argNameMap["orderByDesc"], 'desc', opt.typeCache),
    range(argNameMap["range"])
  ];
};

function basicOperator(op, postfix) {
  return function (fields, modelClass) {
    var args = {};

    _.each(fields, function (field, propName) {
      var columnName = modelClass.propertyNameToColumnName(propName);

      args[propName + postfix] = {
        type: field.type,
        query: function (query, value) {
          query.where(columnName, op, value);
        }
      };
    });

    return args;
  };
}

function likeNoCase(postfix) {
  return function (fields, modelClass) {
    var args = {};

    _.each(fields, function (field, propName) {
      var columnName = modelClass.propertyNameToColumnName(propName);

      args[propName + postfix] = {
        type: field.type,
        query: function (query, value) {
          query.whereRaw('lower(??) like ?', [columnName, value.toLowerCase()]);
        }
      };
    });

    return args;
  };
}

function whereIn(method, postfix) {
  return function (fields, modelClass) {
    var args = {};

    _.each(fields, function (field, propName) {
      var columnName = modelClass.propertyNameToColumnName(propName);

      args[propName + postfix] = {
        type: new GraphQLList(field.type),
        query: function (query, value) {
          query[method](columnName, value);
        }
      };
    });

    return args;
  };
}

function orderBy(argName, direction, typeCache) {
  return function (fields, modelClass) {
    var args = {};

    var modelClassTypeName = utils.typeNameForModel(modelClass);
    var typeName = modelClassTypeName + 'PropertiesEnum';

    if (!typeCache[typeName]) {
      typeCache[typeName] = new GraphQLEnumType({
        name: typeName,
        description: 'Properties of model ' + modelClassTypeName,
        values: _.mapValues(fields, function (field, propertyName) {
          var columnName = modelClass.propertyNameToColumnName(propertyName);
          return {
            value: columnName
          };
        })
      });
    }

    var propertiesEnum = typeCache[typeName];
    args[argName] = {
      type: propertiesEnum,
      query: function (query, value) {
        query.orderBy(value, direction);
      }
    };

    return args;
  };
}

function range(argName) {
  return function () {
    var args = {};

    args[argName] = {
      type: new GraphQLList(GraphQLInt),
      description: 'Select a range of results: [start, end]. start and end are inclusive.',
      query: function (query, values) {
        var start = parseInt(values[0]);
        var end = parseInt(values[1]);
        query.offset(start).limit(end - start + 1);
      }
    };

    return args;
  };
}
