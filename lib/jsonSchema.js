'use strict';

var _ = require('lodash')
  , utils = require('./utils')
  , graphqlRoot = require('graphql')
  , GraphQLEnumType =  graphqlRoot.GraphQLEnumType
  , GraphQLBoolean = graphqlRoot.GraphQLBoolean
  , GraphQLString =  graphqlRoot.GraphQLString
  , GraphQLFloat = graphqlRoot.GraphQLFloat
  , GraphQLInt = graphqlRoot.GraphQLInt;

module.exports = {
  jsonSchemaToGraphQLFields: jsonSchemaToGraphQLFields
};

function jsonSchemaToGraphQLFields(jsonSchema, opt) {
  return _.reduce(jsonSchema.properties, function (fields, propSchema, propName) {
    if (utils.isExcluded(opt, propName)) {
      return fields;
    }

    fields[propName] = jsonSchemaToGraphQLField(propSchema, propName, opt);
    return fields;
  }, {});
}

function jsonSchemaToGraphQLField(jsonSchema, propName, opt) {
  var schemas;

  if (jsonSchema.anyOf || jsonSchema.oneOf) {
    schemas = _.reject(jsonSchema.anyOf || jsonSchema.oneOf, isNullSchema);

    if (schemas.length === 1) {
      return jsonSchemaToGraphQLField(schemas[0], propName, opt);
    } else {
      throw new Error('multiple anyOf/oneOf schemas in json schema is not supported. schema: ' + JSON.stringify(schema));
    }
  } else if (_.isArray(jsonSchema.type)) {
    var type = _.reject(jsonSchema.type, isNullType);

    if (type.length === 1) {
      return jsonSchemaTypeToGraphQLField(type[0], jsonSchema, propName, opt);
    } else {
      throw new Error('multiple values in json schema `type` property not supported. schema: ' + JSON.stringify(jsonSchema));
    }
  } else {
    return jsonSchemaTypeToGraphQLField(jsonSchema.type, jsonSchema, propName, opt);
  }
}

function jsonSchemaTypeToGraphQLField(type, jsonSchema, propName, opt) {
  var graphQlField;

  if (_.isArray(jsonSchema.enum)) {
    graphQlField = jsonSchemaEnumToGraphQLField(jsonSchema.enum, propName, opt);
  } else {
    graphQlField = jsonSchemaPrimitiveToGraphQLField(type);
  }

  if (jsonSchema.description) {
    graphQlField.description = jsonSchema.description;
  }

  return graphQlField;
}

function jsonSchemaEnumToGraphQLField(enumeration, propName, opt) {
  var typeName = opt.typeNamePrefix + _.capitalize(_.camelCase(propName)) + 'Enum';

  if (!opt.typeCache[typeName]) {
    opt.typeCache[typeName] = new GraphQLEnumType({
      name: typeName,
      values: _.reduce(enumeration, function (values, enumValue) {
        values[enumValue] = {value: enumValue};
        return values;
      }, {})
    });
  }

  return {type: opt.typeCache[typeName]};
}

function jsonSchemaPrimitiveToGraphQLField(type) {
  var graphQlType = jsonSchemaPrimitiveToGraphQLType(type);

  if (!graphQlType) {
    throw new Error('cannot convert json schema type "' + type + '" into GraphQL type');
  }

  return {type: graphQlType};
}

function jsonSchemaPrimitiveToGraphQLType(type) {
  switch (type) {
    case 'string': return GraphQLString;
    case 'integer': return GraphQLInt;
    case 'number': return GraphQLFloat;
    case 'boolean': return GraphQLBoolean;
    default: return null;
  }
}

function isNullSchema(schema) {
  return isNullType(schema.type) || (_.isArray(schema.type) && _.all(schema.type, isNullType));
}

function isNullType(type) {
  return type === 'null' || type === null;
}
