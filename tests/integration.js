var _ = require('lodash')
  , os = require('os')
  , path = require('path')
  , expect = require('expect.js')
  , graphql = require('graphql').graphql
  , GraphQLList = require('graphql').GraphQLList
  , GraphQLObjectType = require('graphql').GraphQLObjectType
  , mainModule = require('../')
  , models = require('./setup/models')
  , IntegrationTestSession = require('./setup/IntegrationTestSession');

describe('integration tests', function () {
  var session;

  before(function () {
    session = new IntegrationTestSession({
      knex: {
        client: 'sqlite3',
        useNullAsDefault: true,
        connection: {
          filename: path.join(os.tmpdir(), 'graphql-objection.db')
        }
      }
    });
  });

  before(function () {
    return session.createTables();
  });

  before(function () {
    return session.models.Movie.query().insertWithRelated([{
      name: 'The terminator',
      releaseDate: '1984-10-26',

      actors: [{
        "#id": 'arnold',
        firstName: 'Arnold',
        lastName: 'Schwarzenegger',
        gender: 'Male',
        age: 73,

        addresses: [{
          street: 'Arnoldlane 12',
          city: 'Arnoldova',
          zipCode: '123456'
        }],

        parent: {
          firstName: 'Gustav',
          lastName: 'Schwarzenegger',
          gender: 'Male',
          age: 98,

          addresses: [{
            street: 'Gustavroad 64',
            city: 'Gustavia',
            zipCode: '654321'
          }]
        }
      }, {
        firstName: 'Michael',
        lastName: 'Biehn',
        gender: 'Male',
        age: 45
      }],

      reviews: [{
        title: 'Great movie',
        stars: 5,
        text: 'Awesome',

        reviewer: {
          "#id": 'randomDudette',
          firstName: 'Some',
          lastName: 'Random-Dudette',
          gender: 'Female',
          age: 20
        }
      }, {
        title: 'Changed my mind',
        stars: 4,
        text: 'Now I thing this is semi-awesome',

        reviewer: {
          "#ref": 'randomDudette'
        }
      }]
    }, {
      name: 'Terminator 2: Judgment Day',
      releaseDate: '1991-07-03',

      actors: [{
        "#ref": 'arnold'
      }]
    }, {
      name: 'Predator',
      releaseDate: '1987-07-12',

      actors: [{
        "#ref": 'arnold'
      }]
    }]);
  });

  describe('list fields', function () {
    var schema;

    beforeEach(function () {
      schema = mainModule
        .builder()
        .model(session.models.Person, {listFieldName: 'people'})
        .model(session.models.Movie)
        .model(session.models.Review)
        .build();
    });

    it('knex instance can be provided as the root value', function () {
      // Create a schema with unbound models. This test would fail if the
      // knex didn't get bound to the models inside the SchemaQueryBuilder.
      schema = mainModule
        .builder()
        .model(models.Person, {listFieldName: 'people'})
        .model(models.Movie)
        .model(models.Review)
        .build();

      return graphql(schema, '{ people { firstName } }', session.knex).then(function (res) {
        expect(res.data.people).to.eql([{
          firstName: 'Gustav'
        }, {
          firstName: 'Michael'
        }, {
          firstName: 'Some'
        }, {
          firstName: 'Arnold'
        }]);
      });
    });

    it('root should have `people` field', function () {
      return graphql(schema, '{ people { firstName } }').then(function (res) {
        expect(res.data.people).to.eql([{
          firstName: 'Gustav'
        }, {
          firstName: 'Michael'
        }, {
          firstName: 'Some'
        }, {
          firstName: 'Arnold'
        }]);
      });
    });

    it('root should have `movies` field', function () {
      return graphql(schema, '{ movies(orderByDesc: name) { name } }').then(function (res) {
        expect(res.data.movies).to.eql([{
          name: 'The terminator'
        }, {
          name: 'Terminator 2: Judgment Day'
        }, {
          name: 'Predator'
        }]);
      });
    });

    it('root should have `reviews` field', function () {
      return graphql(schema, '{ reviews { title } }').then(function (res) {
        expect(res.data.reviews).to.eql([{
          title: 'Great movie'
        }, {
          title: 'Changed my mind'
        }]);
      });
    });

    it('`people` field should have all properties defined in the Person model\'s jsonSchema', function () {
      return graphql(schema, '{ people { id, age, gender, firstName, lastName, parentId, addresses { street, city, zipCode } } }').then(function (res) {
        expect(res.data.people).to.eql([{
          id: 1,
          age: 98,
          firstName: 'Gustav',
          lastName: 'Schwarzenegger',
          gender: 'Male',
          parentId: null,
          addresses: [{
            street: 'Gustavroad 64',
            city: 'Gustavia',
            zipCode: '654321'
          }]
        }, {
          id: 2,
          age: 45,
          firstName: 'Michael',
          lastName: 'Biehn',
          gender: 'Male',
          parentId: null,
          addresses: null
        }, {
          id: 3,
          age: 20,
          firstName: 'Some',
          lastName: 'Random-Dudette',
          gender: 'Female',
          parentId: null,
          addresses: null
        }, {
          id: 4,
          age: 73,
          firstName: 'Arnold',
          lastName: 'Schwarzenegger',
          gender: 'Male',
          parentId: 1,
          addresses: [{
            street: 'Arnoldlane 12',
            city: 'Arnoldova',
            zipCode: '123456'
          }]
        }]);
      });
    });

    describe('#argFactory', function () {

      it('should register custom filter arguments', function () {
        schema = mainModule
          .builder()
          .model(session.models.Person, {listFieldName: 'people'})
          .model(session.models.Movie)
          .model(session.models.Review)
          .argFactory(function (fields, modelClass) {
            var args = {};

            _.each(fields, function (field, propName) {
              var columnName = modelClass.propertyNameToColumnName(propName);

              if (field.type instanceof GraphQLObjectType || field.type instanceof GraphQLList) {
                return;
              }

              args[propName + 'EqualsReverse'] = {
                type: field.type,
                query: function (query, value) {
                  query.where(columnName, '=', value.split('').reverse().join(''));
                }
              };
            });

            return args;
          })
          .build();

        return graphql(schema, '{ people(firstNameEqualsReverse: "dlonrA", lastNameEqualsReverse: "reggenezrawhcS") { firstName } }', session.knex).then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Arnold'
          }]);
        });
      });

    });

    describe('#defaultArgNames', function () {

      it('should change the names/postfixes of the default arguments', function () {
        schema = mainModule
          .builder()
          .model(session.models.Person, {listFieldName: 'people'})
          .model(session.models.Movie)
          .model(session.models.Review)
          .defaultArgNames({
            "eq": '_eq',
            "gt": '_gt',
            "gte": '_gte',
            "lt": '_lt',
            "lte": '_lte',
            "like": '_like',
            "likeNoCase": '_like_no_case',
            "in": '_in',
            "notIn": '_not_in',
            "orderBy": 'order_by',
            "orderByDesc": 'order_by_desc',
            "range": "range"
          })
          .build();

        return graphql(schema, '{ people(firstName_eq: "Arnold", lastName_in: ["Schwarzenegger", "Random-Dudette"], order_by: age) { firstName } }', session.knex).then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Arnold'
          }]);
        });
      });

    });

    describe('relations', function () {

      it('`people` should have all the relations of a Person model', function () {
        return graphql(schema, '{ people { firstName, parent { firstName }, children { firstName }, movies { name }, reviews { title } } }').then(function (res) {
          var arnold = _.find(res.data.people, {firstName: 'Arnold'});

          expect(arnold).to.eql({
            firstName: 'Arnold',
            children: [],
            reviews: [],
            parent: {
              firstName: 'Gustav'
            },
            movies: [{
              name: 'The terminator'
            }, {
              name: 'Terminator 2: Judgment Day'
            }, {
              name: 'Predator'
            }]
          });
        });
      });

      it('`movies` should have all the relations of a Movies model', function () {
        return graphql(schema, '{ movies { name, releaseDate, actors { firstName }, reviews { title } } }').then(function (res) {
          var terminator = _.find(res.data.movies, {name: 'The terminator'});

          expect(terminator).to.eql({
            name: 'The terminator',
            releaseDate: '1984-10-26',
            actors: [{
              firstName: 'Arnold'
            }, {
              firstName: 'Michael'
            }],
            reviews: [{
              title: 'Great movie'
            }, {
              title: 'Changed my mind'
            }]
          });
        });
      });

      it('`reviews` should have all the relations of a Review model', function () {
        return graphql(schema, '{ reviews { title, reviewer { firstName }, movie { name } } }').then(function (res) {
          var greatMovie = _.find(res.data.reviews, {title: 'Great movie'});

          expect(greatMovie).to.eql({
            title: 'Great movie',
            reviewer: {
              firstName: 'Some'
            },
            movie: {
              name: 'The terminator'
            }
          });
        });
      });

      it('should be able to fetch nested relations', function () {
        return graphql(schema, '{ movies { name, actors { firstName, movies { name } }, reviews { title, reviewer { firstName } } } }').then(function (res) {
          var terminator = _.find(res.data.movies, {name: 'The terminator'});

          expect(terminator).to.eql({
            name: 'The terminator',
            actors: [{
              firstName: 'Arnold',
              movies: [{
                name: 'The terminator'
              }, {
                name: 'Terminator 2: Judgment Day'
              }, {
                name: 'Predator'
              }]
            }, {
              firstName: 'Michael',
              movies: [{
                name: 'The terminator'
              }]
            }],
            reviews: [{
              title: 'Great movie',
              reviewer: {
                firstName: 'Some'
              }
            }, {
              title: 'Changed my mind',
              reviewer: {
                firstName: 'Some'
              }
            }]
          });
        });
      });

    });

    describe('arguments', function () {

      it('each property name should work as a `==` filter', function () {
        return graphql(schema, '{ people(age: 73) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Arnold'
          }]);
        });
      });

      it('adding \'Gt\' after a property name should create a `>` filter', function () {
        return graphql(schema, '{ people(ageGt: 73) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Gustav'
          }]);
        });
      });

      it('adding \'Gte\' after a property name should create a `>=` filter', function () {
        return graphql(schema, '{ people(ageGte: 73) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Gustav'
          }, {
            firstName: 'Arnold'
          }]);
        });
      });

      it('adding \'Lt\' after a property name should create a `<` filter', function () {
        return graphql(schema, '{ people(ageLt: 73) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Michael'
          }, {
            firstName: 'Some'
          }]);
        });
      });

      it('adding \'Lte\' after a property name should create a `<=` filter', function () {
        return graphql(schema, '{ people(ageLte: 73) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Michael'
          }, {
            firstName: 'Some'
          }, {
            firstName: 'Arnold'
          }]);
        });
      });

      it('adding \'Like\' after a property name should create a `like` filter', function () {
        return graphql(schema, '{ people(lastNameLike: "%egg%") { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Gustav'
          }, {
            firstName: 'Arnold'
          }]);
        });
      });

      it('adding \'LikeNoCase\' after a property name should create a case insensitive `like` filter', function () {
        return graphql(schema, '{ people(lastNameLikeNoCase: "sch%") { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Gustav'
          }, {
            firstName: 'Arnold'
          }]);
        });
      });

      it('adding \'In\' after a property name should create an `in` filter', function () {
        return graphql(schema, '{ people(ageIn: [45, 98]) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Gustav'
          }, {
            firstName: 'Michael'
          }]);
        });
      });

      it('adding \'NotIn\' after a property name should create an `not in` filter', function () {
        return graphql(schema, '{ people(ageNotIn: [45, 98]) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Some'
          }, {
            firstName: 'Arnold'
          }]);
        });
      });

      it('adding \'IsNull: true\' after a property name should create an `is null` filter', function () {
        return graphql(schema, '{ people(parentIdIsNull: true) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Gustav'
          }, {
            firstName: 'Michael'
          }, {
            firstName: 'Some'
          }]);
        });
      });

      it('adding \'IsNull: false\' after a property name should create an `not null` filter', function () {
        return graphql(schema, '{ people(parentIdIsNull: false) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Arnold'
          }]);
        });
      });

      it('orderBy should order by the given property', function () {
        return graphql(schema, '{ people(orderBy: age) { firstName, age } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Some',
            age: 20
          }, {
            firstName: 'Michael',
            age: 45
          }, {
            firstName: 'Arnold',
            age: 73
          }, {
            firstName: 'Gustav',
            age: 98
          }]);
        });
      });

      it('orderByDesc should order by the given property in descending order', function () {
        return graphql(schema, '{ people(orderByDesc: age) { firstName, age } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Gustav',
            age: 98
          }, {
            firstName: 'Arnold',
            age: 73
          }, {
            firstName: 'Michael',
            age: 45
          }, {
            firstName: 'Some',
            age: 20
          }]);
        });
      });

      it('range should select a range', function () {
        return graphql(schema, '{ people(range: [1, 2], orderBy: age) { firstName, age } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Michael',
            age: 45
          }, {
            firstName: 'Arnold',
            age: 73
          }]);
        });
      });

      it('jsonSchema enums should be usable as GraphQL enums', function () {
        return graphql(schema, '{ people(gender: Male) { firstName } }').then(function (res) {
          expect(res.data.people).to.eql([{
            firstName: 'Gustav'
          }, {
            firstName: 'Michael'
          }, {
            firstName: 'Arnold'
          }]);
        });
      });

      describe('relations', function () {

        it('relations should take the same arguments as root fields (1)', function () {
          return graphql(schema, '{ person(firstName: "Arnold") { movies(releaseDateGt: "1987-01-01", orderBy: releaseDate) { name } } }').then(function (res) {
            expect(res.data.person).to.eql({
              movies: [{
                name: 'Predator'
              }, {
                name: 'Terminator 2: Judgment Day'
              }]
            });
          });
        });

        it('relations should take the same arguments as root fields (2)', function () {
          return graphql(schema, '{ person(firstName: "Arnold") { movies(releaseDateGt: "1987-01-01", orderByDesc: releaseDate) { name } } }').then(function (res) {
            expect(res.data.person).to.eql({
              movies: [{
                name: 'Terminator 2: Judgment Day'
              }, {
                name: 'Predator'
              }]
            });
          });
        });

        it('relations should take the same arguments as root fields (3)', function () {
          return graphql(schema, '{ person(firstName: "Arnold") { movies(releaseDateLte: "1987-01-01", orderBy: releaseDate) { name } } }').then(function (res) {
            expect(res.data.person).to.eql({
              movies: [{
                name: 'The terminator'
              }]
            });
          });
        });

        it('nested relations should take the same arguments as root fields', function () {
          return graphql(schema, '{ person(firstName: "Arnold") { movies(name: "The terminator") { name, actors(firstNameLikeNoCase : "%chae%") { firstName } } } }').then(function (res) {
            expect(res.data.person).to.eql({
              movies: [{
                name: 'The terminator',
                actors: [{
                  firstName: 'Michael'
                }]
              }]
            });
          });
        });

      });

    });

  });

  describe('single fields', function () {
    var schema;

    before(function () {
      schema = mainModule
        .builder()
        .model(session.models.Person, {listFieldName: 'people'})
        .model(session.models.Movie)
        .model(session.models.Review)
        .build();
    });

    it('root should have `person` field', function () {
      return graphql(schema, '{ person(id: 1) { firstName } }').then(function (res) {
        expect(res.data.person).to.eql({
          firstName: 'Gustav'
        });
      });
    });

    it('root should have `movie` field', function () {
      return graphql(schema, '{ movie(nameLikeNoCase: "%terminator 2%") { name } }').then(function (res) {
        expect(res.data.movie).to.eql({
          name: 'Terminator 2: Judgment Day'
        });
      });
    });

    it('root should have `review` field', function () {
      return graphql(schema, '{ review(id: 1) { title } }').then(function (res) {
        expect(res.data.review).to.eql({
          title: 'Great movie'
        });
      });
    });

    it('single fields should have all the same arguments and relations as the list fields', function () {
      return graphql(schema, '{ person(firstName: "Arnold") { movies(name: "The terminator") { name, actors(firstNameLikeNoCase : "%chae%") { firstName } } } }').then(function (res) {
        expect(res.data.person).to.eql({
          movies: [{
            name: 'The terminator',
            actors: [{
              firstName: 'Michael'
            }]
          }]
        });
      });
    });

  });

});
