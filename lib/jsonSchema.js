'use strict';

const _ = require('lodash')
  , utils = require('./utils')
  , graphqlRoot = require('graphql')
  , GraphQLObjectType =  graphqlRoot.GraphQLObjectType
  , GraphQLEnumType =  graphqlRoot.GraphQLEnumType
  , GraphQLNonNull = graphqlRoot.GraphQLNonNull
  , GraphQLBoolean = graphqlRoot.GraphQLBoolean
  , GraphQLString =  graphqlRoot.GraphQLString
  , GraphQLFloat = graphqlRoot.GraphQLFloat
  , GraphQLList = graphqlRoot.GraphQLList
  , GraphQLInt = graphqlRoot.GraphQLInt;

function jsonSchemaToGraphQLFields(jsonSchema, opt) {
  const ctx = _.defaults(opt || {}, {
    include: null,
    exclude: null,
    typeIndex: 1,
    typeNamePrefix: '',
    typeCache: {}
  });

  const requiredFields = jsonSchema.required || [];
  const fields = {};

  _.forOwn(jsonSchema.properties, (propSchema, propName) => {
    if (utils.isExcluded(ctx, propName)) {
      return;
    }

    fields[propName] = toGraphQLField(propSchema, propName, ctx, requiredFields.indexOf(propName) !== -1);
  });

  return fields;
}

function toGraphQLField(jsonSchema, propName, ctx, required) {
  let schemas;

  if (jsonSchema.anyOf || jsonSchema.oneOf) {
    schemas = _.reject(jsonSchema.anyOf || jsonSchema.oneOf, isNullSchema);

    if (schemas.length === 1) {
      return toGraphQLField(schemas[0], propName, ctx);
    } else {
      throw new Error('multiple anyOf/oneOf schemas in json schema is not supported. schema: ' + JSON.stringify(jsonSchema));
    }
  } else if (_.isArray(jsonSchema.type)) {
    const type = _.reject(jsonSchema.type, isNullType);

    if (type.length === 1) {
      return typeToGraphQLField(type[0], jsonSchema, propName, ctx, required);
    } else {
      throw new Error('multiple values in json schema `type` property not supported. schema: ' + JSON.stringify(jsonSchema));
    }
  } else {
    return typeToGraphQLField(jsonSchema.type, jsonSchema, propName, ctx, required);
  }
}

function typeToGraphQLField(type, jsonSchema, propName, ctx, required) {
  let graphQlField;

  if (_.isArray(jsonSchema.enum)) {
    graphQlField = enumToGraphQLField(jsonSchema.enum, propName, ctx, required);
  } else if (type === 'object') {
    graphQlField = objectToGraphQLField(jsonSchema, propName, ctx, required);
  }else if (type === 'array') {
    graphQlField = arrayToGraphQLField(jsonSchema, propName, ctx, required);
  } else {
    graphQlField = primitiveToGraphQLField(type, required);
  }

  if (jsonSchema.description) {
    graphQlField.description = jsonSchema.description;
  }

  return graphQlField;
}

function enumToGraphQLField(enumeration, propName, ctx, required) {
  var typeName = ctx.typeNamePrefix + _.upperFirst(_.camelCase(propName)) + 'Enum' + (ctx.typeIndex++);

  if (!ctx.typeCache[typeName]) {
    let type = new GraphQLEnumType({
      name: typeName,
      values: _.reduce(enumeration, (values, enumValue) => {
        values[enumValue] = {value: enumValue};
        return values;
      }, {})
    });
    if(required) {
      type = new GraphQLNonNull(type);
    }
    ctx.typeCache[typeName] = type;
  }

  return {type: ctx.typeCache[typeName]};
}

function objectToGraphQLField(jsonSchema, propName, ctx, required) {
  const typeName = ctx.typeNamePrefix + _.upperFirst(_.camelCase(propName)) + 'JsonType' + (ctx.typeIndex++);

  if (!ctx.typeIndex[typeName]) {
    ctx.typeCache[typeName] = new GraphQLObjectType({
      name: typeName,
      fields() {
        const fields = {};

        _.forOwn(jsonSchema.properties, (propSchema, propName) => {
          fields[propName] = toGraphQLField(propSchema, propName, ctx, required);
        });

        return fields;
      }
    });
  }

  return {type: ctx.typeCache[typeName]};
}

function arrayToGraphQLField(jsonSchema, propName, ctx, required) {
  if (_.isArray(jsonSchema.items)) {
    throw new Error('multiple values in `items` of array type is not supported. schema: ' + JSON.stringify(jsonSchema));
  }

  return {
    type: new GraphQLList(toGraphQLField(jsonSchema.items, propName, ctx, required).type)
  };
}

function primitiveToGraphQLField(type, required) {
  let graphQlType = primitiveToGraphQLType(type);

  if (!graphQlType) {
    throw new Error('cannot convert json schema type "' + type + '" into GraphQL type');
  }

  if (required) {
    graphQlType = new GraphQLNonNull(graphQlType);
  }

  return {type: graphQlType};
}

function primitiveToGraphQLType(type) {
  switch (type) {
    case 'string': return GraphQLString;
    case 'integer': return GraphQLInt;
    case 'number': return GraphQLFloat;
    case 'boolean': return GraphQLBoolean;
    default: return null;
  }
}

function isNullSchema(schema) {
  return isNullType(schema.type) || (_.isArray(schema.type) && _.every(schema.type, isNullType));
}

function isNullType(type) {
  return type === 'null' || type === null;
}

module.exports = {
  jsonSchemaToGraphQLFields
};
