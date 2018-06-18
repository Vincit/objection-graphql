const _ = require('lodash');
const graphqlRoot = require('graphql');

const {
  GraphQLObjectType, GraphQLEnumType, GraphQLBoolean, GraphQLString, GraphQLFloat, GraphQLList, GraphQLInt,
} = graphqlRoot;

const utils = require('./utils');

function jsonSchemaToGraphQLFields(jsonSchema, opt) {
  const ctx = _.defaults(opt || {}, {
    include: null,
    exclude: null,
    typeIndex: 1,
    typeNamePrefix: '',
    typeCache: {},
  });

  const fields = {};

  _.forOwn(jsonSchema.properties, (propSchema, propName) => {
    if (utils.isExcluded(ctx, propName)) {
      return;
    }

    fields[propName] = toGraphQLField(propSchema, propName, ctx);
  });

  return fields;
}

function toGraphQLField(jsonSchema, propName, ctx) {
  let schemas;

  if (jsonSchema.anyOf || jsonSchema.oneOf) {
    schemas = _.reject(jsonSchema.anyOf || jsonSchema.oneOf, isNullSchema);

    if (schemas.length === 1) {
      return toGraphQLField(schemas[0], propName, ctx);
    }
    throw new Error(`multiple anyOf/oneOf schemas in json schema is not supported. schema: ${JSON.stringify(jsonSchema)}`);
  } else if (_.isArray(jsonSchema.type)) {
    const type = _.reject(jsonSchema.type, isNullType);

    if (type.length === 1) {
      return typeToGraphQLField(type[0], jsonSchema, propName, ctx);
    }
    throw new Error(`multiple values in json schema \`type\` property not supported. schema: ${JSON.stringify(jsonSchema)}`);
  } else {
    return typeToGraphQLField(jsonSchema.type, jsonSchema, propName, ctx);
  }
}

function typeToGraphQLField(type, jsonSchema, propName, ctx) {
  let graphQlField;

  if (_.isArray(jsonSchema.enum)) {
    graphQlField = enumToGraphQLField(jsonSchema.enum, propName, ctx);
  } else if (type === 'object') {
    graphQlField = objectToGraphQLField(jsonSchema, propName, ctx);
  } else if (type === 'array') {
    graphQlField = arrayToGraphQLField(jsonSchema, propName, ctx);
  } else {
    graphQlField = primitiveToGraphQLField(type);
  }

  if (jsonSchema.description) {
    graphQlField.description = jsonSchema.description;
  }

  return graphQlField;
}

function enumToGraphQLField(enumeration, propName, ctx) {
  ctx.typeIndex += 1;
  const typeName = `${ctx.typeNamePrefix + _.upperFirst(_.camelCase(propName))}Enum${ctx.typeIndex}`;

  if (!ctx.typeCache[typeName]) {
    ctx.typeCache[typeName] = new GraphQLEnumType({
      name: typeName,
      values: _.reduce(enumeration, (values, enumValue) => {
        values[enumValue] = { value: enumValue };
        return values;
      }, {}),
    });
  }

  return { type: ctx.typeCache[typeName] };
}

function objectToGraphQLField(jsonSchema, propName, ctx) {
  ctx.typeIndex += 1;
  const typeName = `${ctx.typeNamePrefix + _.upperFirst(_.camelCase(propName))}JsonType${ctx.typeIndex}`;

  if (!ctx.typeIndex[typeName]) {
    ctx.typeCache[typeName] = new GraphQLObjectType({
      name: typeName,
      fields() {
        const fields = {};

        _.forOwn(jsonSchema.properties, (propSchema, curPropName) => {
          fields[curPropName] = toGraphQLField(propSchema, curPropName, ctx);
        });

        return fields;
      },
    });
  }

  return { type: ctx.typeCache[typeName] };
}

function arrayToGraphQLField(jsonSchema, propName, ctx) {
  if (_.isArray(jsonSchema.items)) {
    throw new Error(`multiple values in \`items\` of array type is not supported. schema: ${JSON.stringify(jsonSchema)}`);
  }

  return {
    type: new GraphQLList(toGraphQLField(jsonSchema.items, propName, ctx).type),
  };
}

function primitiveToGraphQLField(type) {
  const graphQlType = primitiveToGraphQLType(type);

  if (!graphQlType) {
    throw new Error(`cannot convert json schema type "${type}" into GraphQL type`);
  }

  return { type: graphQlType };
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
  jsonSchemaToGraphQLFields,
};
