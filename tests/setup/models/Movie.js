'use strict';

var Model = require('objection').Model;

class Movie extends Model {

}

// Model.extend(Movie);
module.exports = Movie;

Movie.tableName = 'Movie';

Movie.jsonSchema = {
  type: 'object',
  required: ['name'],

  properties: {
    id: {type: 'integer'},
    name: {type: 'string', minLength: 1, maxLength: 255},
    releaseDate: {anyOf: [
      {type: 'string', format: 'date'},
      {type: 'null'}
    ]}
  }
};

Movie.relationMappings = {
  actors: {
    relation: Model.ManyToManyRelation,
    modelClass: require('./Person'),
    join: {
      from: 'Movie.id',
      through: {
        from: 'Person_Movie.movieId',
        to: 'Person_Movie.personId'
      },
      to: 'Person.id'
    }
  },

  reviews: {
    relation: Model.HasManyRelation,
    modelClass: require('./Review'),
    join: {
      from: 'Movie.id',
      to: 'Review.movieId'
    }
  }
};
