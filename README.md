# objection-graphql

Automatic GraphQL API generator for objection.js

## Usage

All you need to do to get a rich GraphQL API for your objection.js models is this:

```js
const graphQlSchema = new SchemaBuilder()
  .model(Person)
  .model(Movie)
  .model(Review)
  .build();
```

After that you can use the created schema object to perform GraphQL queries:

```js
const result = yield graphql(graphQlSchema, `{
  persons(ageGt: 40, gender: Male, lastNameLike: "%negg%", orderBy: age) {
    id,
    firstName,
    movies(orderBy: releaseDate, nameLikeNoCase: "%erminato%") {
      name,
      actors(ageLte: 100, orderBy: firstName) {
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
  }
}`);

console.log(result);
```

objection-graphql automatically generates a [GraphQL](https://github.com/facebook/graphql) schema for [objection.js](https://github.com/Vincit/objection.js)
models. The schema is created based on the `jsonSchema` and `relationMappings` properties of objection.js
models. It creates a rich set of filter arguments for the relations and provides a simple way to add custom filters.

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



# Adding your own custom arguments

