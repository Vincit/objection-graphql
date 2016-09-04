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
}`).then(function (result) {
  console.log(result.data.movies);
});
```

The example query used some of the many default filter arguments. For example the `nameLike: "%erminato%"`
filter is mapped into a where clause `where name like '%erminato%'`. Similarily the `ageLte: 100` is mapped into
a `where age <= 100` clause. In addition to the property filters there are some special arguments like `orderBy` and 
`range`. Check out [TODO]() for a full list of filter arguments available by default. See [TODO]() on how to easily 
add your own custom arguments.

# Getting started

If you are already using objection.js the example in the [introduction](#introduction) is all you need to get started. 
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

# Adding your own custom arguments

TODO
