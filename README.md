# objection-graphql

Automatic GraphQL API generator for objection.js models.

## Usage

objection-graphql automatically generates a [GraphQL](https://github.com/facebook/graphql) schema 
for [objection.js](https://github.com/Vincit/objection.js) models. The schema is created based on the `jsonSchema` 
and `relationMappings` properties of the models. It creates a rich set of filter arguments for the 
relations and provides a simple way to add custom filters.

The following example creates a schema for three models `Person`, `Movie` and `Review` and executes a GraphQL query:

```js
const graphql = require('graphql').graphql;
const graphQlBuilder = require('objection-graphql').builder;

// Objection.js models.
const Movie = require('./models/Movie');
const Person = require('./models/Person');
const Review = require('./models/Review');

// This is all you need to do to generate the schema.
const graphQlSchema = graphQlBuilder()
  .model(Movie)
  .model(Person)
  .model(Review)
  .build();

// Or: 
// const models = [Movie, Person, Review]
// const graphQlSchema = graphQlBuilder().allModels(models).build();

// Execute a GraphQL query.
graphql(graphQlSchema, `{
  movies(nameLike: "%erminato%", range: [0, 2], orderBy: releaseDate) {
    name,
    releaseDate,
    
    actors(gender: Male, ageLte: 100, orderBy: firstName) {
      id
      firstName,
      age
    }
    
    reviews(starsIn: [3, 4, 5], orderByDesc: stars) {
      title,
      text,
      stars,
      
      reviewer {
        firstName
      }
    }
  }
}`).then(result => {
  console.log(result.data.movies);
});
```

The example query used some of the many default filter arguments. For example the `nameLike: "%erminato%"`
filter is mapped into a where clause `where name like '%erminato%'`. Similarily the `ageLte: 100` is mapped into
a `where age <= 100` clause. In addition to the property filters there are some special arguments like `orderBy` and 
`range`. Check out [this table](#filters) for a full list of filter arguments available by default.

# Getting started

If you are already using objection.js the example in the [usage](#usage) section is all you need to get started. 
If you are unfamiliar with objection.js you should try our [example project](https://github.com/Vincit/objection.js/tree/master/examples/express-es6).

# Filters

argument|type|action
------|----|----------
`prop: value`|property type|`prop = value`
`propEq: value`|property type|`prop = value`
`propGt: value`|property type|`prop > value`
`propGte: value`|property type|`prop >= value`
`propLt: value`|property type|`prop < value`
`propLte: value`|property type|`prop <= value`
`propLike: value`|string|`prop LIKE value`
`propIsNull: value`|boolean|`prop IS NULL` or `prop IS NOT NULL`
`propIn: value`|Array<property type>|`prop IN value`
`propNotIn: value`|Array<property type>|`prop NOT IN value`
`propLikeNoCase: value`|string|`lower(prop) LIKE lower(value)`

# Special arguments

argument|action
------|-----------
`orderBy: prop`|Order the result by some property
`orderByDesc: prop`|Order the result by some property in descending order
`range: [start, end]`|Select a range. Doesn't work for relations!
`limit: prop`|Select a given number of records.
`offset: prop`|Skip a given number of records.

# Adding your own custom arguments

Here's an example how you could implement a `NotEq` filter for primitive values:

```js
const graphql = require('graphql');

const graphQlSchema = graphQlBuilder()
  .model(Movie)
  .model(Person)
  .model(Review)
  .argFactory((fields, modelClass) => {
    const args = {};

    _.forOwn(fields, (field, propName) => {
      // Skip all non primitive fields.
      if (field.type instanceof graphql.GraphQLObjectType 
          || field.type instanceof graphql.GraphQLList) {
        return;
      }
    
      args[propName + 'NotEq'] = {
        // For our filter the type of the value needs to be 
        // the same as the type of the field.
        type: field.type,
        
        query: (query, value) => {
          // query is an objection.js QueryBuilder instance.
          query.where(propName, '<>', value);
        }
      };
    });

    return args;
  })
  .build();
```

# Extending your schema with mutations

Often you need to provide mutations in your GraphQL schema. At the same time mutations can be quite opinionated with side effects and complex business logic, so plain CUD implementation is not always a good idea. 
Therefore we provide a method `extendWithMutations` which allows you to extend the generated query schema with mutations. You can provide a root `GraphQLObjectType` or a function as a first argument for this method. 
Function in this case plays as a strategy which receives current builder as a first argument and returns `GraphQLObjectType`. 

```js

//...
const personType = new GraphQLObjectType({
    name: 'PersonType',
    description: 'Use this object to create new person',
    fields: () => ({
      id: {
        type: new GraphQLNonNull(GraphQLInt),
        description: 'First Name',
      },
      firstName: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'First Name',
      },
      lastName: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'Last Name',
      },
    }),
});

const createPersonInputType = new GraphQLInputObjectType({
    name: 'CreatePersonType',
    description: 'Person',
    fields: () => ({
      firstName: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'First Name',
      },
      lastName: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'Last Name',
      },
    }),
});
    
const mutationType = new GraphQLObjectType({
    name: 'RootMutationType',
    description: 'Domain API actions',
    fields: () => ({
      createPerson: {
        description: 'Creates a new person',
        type: personType,
        args: {
          input: { type: new GraphQLNonNull(createPersonInputType) },
        },
        resolve: (root, inputPerson) => {
          const { firstName, lastName } = inputPerson.input;
          return {
              id: 1,
              firstName,
              lastName,
          };
        },
      },
    }),
});

//Here you can use a GraphQLObjectType or function as an argument for extendWithMutations
schema = mainModule
  .builder()
  .model(Person)
  .extendWithMutations(mutationType)
  .build();    
```

# Extending your schema with subscriptions

When you want to implement a real-time behavior in your app like push notifications, you basically have two options in graphql: subscriptions and live queries. The first approach is focused on events and granular control over updates, while the other is based on smart live queries, where most of real-rime magic is hidden from the client. We'd like to stick with the first approach since there are some decent implementations out there like [graphql-subscriptions](https://github.com/apollographql/graphql-subscriptions) by Apollo.

The implementation is similar to mutations extention point: you've got an `extendWithSubscriptions` method where you can pass the root `GraphQLObjectType` or a function which can bahave as a strategy which receives current builder as an argument. 

```js
//...
import { PubSub } from 'graphql-subscriptions';
const pubsub = new PubSub();
//...
const personType = new GraphQLObjectType({
    name: 'PersonType',
    description: 'Person',
    fields: () => ({
      id: {
        type: new GraphQLNonNull(GraphQLInt),
        description: 'First Name',
      },
      firstName: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'First Name',
      },
      lastName: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'Last Name',
      },
    }),
});

const subscriptionType = new GraphQLObjectType({
    name: 'RootSubscriptionType',
    description: 'Domain subscriptions',
    fields: () => ({
      personCreated: {
        description: 'A new person created',
        type: personType,
        resolve: (payload: any) => payload,
        subscribe: () => pubsub.asyncIterator('PERSON_CREATED'),
      },
    }),
});

//Here you can use a GraphQLObjectType or function as an argument for extendWithSubscriptions
schema = mainModule
  .builder()
  .model(Person)
  .extendWithSubscriptions(subscriptionType)
  .build();  
```
# Misc

## defaultArgNames

You can change the default filter suffixes and special filter names using the `defaultArgNames` method:

```js
const graphQlSchema = graphQlBuilder()
  .model(Movie)
  .model(Person)
  .model(Review)
  .defaultArgNames({
    eq: '_eq',
    gt: '_gt',
    gte: '_gte',
    lt: '_lt',
    lte: '_lte',
    like: '_like',
    isNull: '_is_null',
    likeNoCase: '_like_no_case',
    in: '_in',
    notIn: '_not_in',
    orderBy: 'order_by',
    orderByDesc: 'order_by_desc',
    range: 'range',
    limit: 'limit',
    offset: 'offset'
  })
  .build();
```

Now you would have `myProp_lt: value` instead of the default `myPropLt: value`.

By default the model names are pluralized by adding an `s` to the end of the camelized table name. You can set a custom
plural and singular names for the root fields like so:

```js
const graphQlSchema = graphQlBuilder()
  .model(Movie)
  .model(Person, {
    listFieldName: 'people',
    fieldName: 'person'
  })
  .model(Review)
```

## onQuery

You can modify the root query by passing an object with `onQuery` method as the third argument for `graphql` method:

```js
const graphQlSchema = graphQlBuilder()
  .model(Movie)
  .model(Person)
  .model(Review)
  .build();

expressApp.get('/graphql', (req, res, next) => {
  graphql(graphQlSchema, req.query.graph, {
    // builder is an objection.js query builder.
    onQuery(builder) {
      // You can for example store the the logged in user to builder context
      // so that it can be accessed from model hooks.
      builder.mergeContext({
        user: req.user
      });
      
      // Or change the eager fetching algorithm.
      builder.eagerAlgorithm(Model.JoinEagerAlgorithm);
    }
  }).then(result => {
    res.send(result);
  }).catch(err => {
    next(err);
  });
});

```

## setBuilderOptions

Allows you to customize **Objection** query builder behavior. For instance, you can pass `{ skipUndefined: true }` as an options argument. So, each time the builder is called, it will be called with **skipUndefined** enabled. 
This can be useful when you use [graphql-tools](https://github.com/apollographql/graphql-tools) schema stitching. 

## Pagination

In many cases it is useful to have a total record count to use with pagination.
If you pass `{ paginated: true }` to the `setBuilderOptions` function all list queries will be 
structured with a `collection` and a `totalCount` field.  For example:
```js
const graphQlSchema = graphQlBuilder()
  .model(Movie)
  .model(Person)
  .model(Review)
  .setBuilderOptions({ paginated: true })
  .build(); 
``` 
allows you to do:
```js
// Execute a GraphQL query.
graphql(graphQlSchema, `{
  movies {
    collection(nameLike: "%erminato%", range: [0, 2], orderBy: releaseDate) {
      name,
      releaseDate,
      
      actors(gender: Male, ageLte: 100, orderBy: firstName) {
        id
        firstName,
        age
      }
      
      reviews(starsIn: [3, 4, 5], orderByDesc: stars) {
        title,
        text,
        stars,
        
        reviewer {
          firstName
        }
      }
    },
  totalCount
}`).then(result => {
  console.log(result.data.movies);
});
```
Note the addition of the `collection` and ``totalCount` fields in the 
GraphQL query.