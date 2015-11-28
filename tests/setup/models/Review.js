'use strict';

var Model = require('objection').Model;

function Review() {
  Model.apply(this, arguments);
}

Model.extend(Review);
module.exports = Review;

Review.tableName = 'Review';

Review.jsonSchema = {
  type: 'object',

  properties: {
    id: {type: 'integer'},
    title: {type: 'string', minLength: 1, maxLength: 255},
    stars: {type: 'integer'},
    text: {type: 'string'},
    reviewerId: {type: 'integer'},
    movieId: {type: 'integer'}
  }
};

Review.relationMappings = {
  reviewer: {
    relation: Model.OneToOneRelation,
    modelClass: require('./Person'),
    join: {
      from: 'Review.reviewerId',
      to: 'Person.id'
    }
  },

  movie: {
    relation: Model.OneToOneRelation,
    modelClass: require('./Movie'),
    join: {
      from: 'Review.movieId',
      to: 'Movie.id'
    }
  }
};
