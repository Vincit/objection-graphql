const _ = require('lodash');
const os = require('os');
const path = require('path');
const expect = require('expect.js');
const {
  graphql, GraphQLList, GraphQLObjectType,
  GraphQLInputObjectType, GraphQLNonNull,
  GraphQLInt, GraphQLString,
} = require('graphql');
const mainModule = require('../');
const models = require('./setup/models');
const IntegrationTestSession = require('./setup/IntegrationTestSession');

const sortByPropAccessor = accessor => (first, second) => first[accessor].localeCompare(second[accessor]);

const sortByFirstName = sortByPropAccessor('firstName');
const sortByName = sortByPropAccessor('name');
const sortByTitle = sortByPropAccessor('title');

describe('integration tests', () => {
  let session;

  before(() => {
    session = new IntegrationTestSession({
      knex: {
        client: 'sqlite3',
        useNullAsDefault: true,
        connection: {
          filename: path.join(os.tmpdir(), 'graphql-objection.db'),
        },
      },
    });
  });

  before(() => session.createTables());

  before(() => session.models.Movie.query().insertGraph([{
    name: 'The terminator',
    releaseDate: '1984-10-26',

    actors: [{
      '#id': 'arnold',
      firstName: 'Arnold',
      lastName: 'Schwarzenegger',
      gender: 'Male',
      age: 73,

      addresses: [{
        street: 'Arnoldlane 12',
        city: 'Arnoldova',
        zipCode: '123456',
      }],

      parent: {
        firstName: 'Gustav',
        lastName: 'Schwarzenegger',
        gender: 'Male',
        age: 98,

        addresses: [{
          street: 'Gustavroad 64',
          city: 'Gustavia',
          zipCode: '654321',
        }],
      },
    }, {
      firstName: 'Michael',
      lastName: 'Biehn',
      gender: 'Male',
      age: 45,
    }],

    reviews: [{
      title: 'Great movie',
      stars: 5,
      text: 'Awesome',

      reviewer: {
        '#id': 'randomDudette',
        firstName: 'Some',
        lastName: 'Random-Dudette',
        gender: 'Female',
        age: 20,
      },
    }, {
      title: 'Changed my mind',
      stars: 4,
      text: 'Now I thing this is semi-awesome',

      reviewer: {
        '#ref': 'randomDudette',
      },
    }],
  }, {
    name: 'Terminator 2: Judgment Day',
    releaseDate: '1991-07-03',

    actors: [{
      '#ref': 'arnold',
    }],
  }, {
    name: 'Predator',
    releaseDate: '1987-07-12',

    actors: [{
      '#ref': 'arnold',
    }],
  }]));

  describe('list fields', () => {
    let schema;

    beforeEach(() => {
      schema = mainModule
        .builder()
        .model(session.models.Person, { listFieldName: 'people' })
        .model(session.models.Movie)
        .model(session.models.Review)
        .build();
    });

    it('knex instance can be provided as the root value', () => {
      // Create a schema with unbound models. This test would fail if
      // knex didn't get bound to the models inside the SchemaQueryBuilder.
      schema = mainModule
        .builder()
        .model(models.Person, { listFieldName: 'people' })
        .model(models.Movie)
        .model(models.Review)
        .build();

      return graphql(schema, '{ people { firstName } }', {
        knex: session.knex,
      }).then((res) => {
        const { data: { people } } = res;
        people.sort(sortByFirstName);

        expect(people).to.eql([
          {
            firstName: 'Arnold',
          },
          {
            firstName: 'Gustav',
          },
          {
            firstName: 'Michael',
          },
          {
            firstName: 'Some',
          },
        ]);
      });
    });

    it('the last argument can have an onQuery hook', () => {
      let onQueryCtx;

      return graphql(schema, '{ people { firstName } }', {
        some: 'stuff',
        onQuery(builder, ctx) {
          builder.where('firstName', 'Michael');
          onQueryCtx = ctx;
        },
      }).then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Michael',
        }]);
      }).then(() => {
        expect(onQueryCtx.some).to.equal('stuff');
      });
    });

    it('root should have `people` field', () => graphql(schema, '{ people { firstName } }').then((res) => {
      const { data: { people } } = res;
      people.sort(sortByFirstName);

      expect(people).to.eql([
        {
          firstName: 'Arnold',
        },
        {
          firstName: 'Gustav',
        },
        {
          firstName: 'Michael',
        },
        {
          firstName: 'Some',
        },
      ]);
    }));

    it('root should have `movies` field', () => graphql(schema, '{ movies(orderByDesc: name) { name } }').then((res) => {
      const { data: { movies } } = res;
      movies.sort(sortByName);

      expect(movies).to.eql([
        {
          name: 'Predator',
        },
        {
          name: 'Terminator 2: Judgment Day',
        },
        {
          name: 'The terminator',
        },
      ]);
    }));

    it('root should have `reviews` field', () => graphql(schema, '{ reviews { title } }').then((res) => {
      expect(res.data.reviews).to.eql([{
        title: 'Great movie',
      }, {
        title: 'Changed my mind',
      }]);
    }));

    it('`people` field should have all properties defined in the Person model\'s jsonSchema', () => graphql(schema, '{ people { age, gender, firstName, lastName, parentId, addresses { street, city, zipCode } } }').then((res) => {
      const { data: { people } } = res;
      people.sort(sortByFirstName);

      expect(people).to.eql([
        {
          age: 73,
          firstName: 'Arnold',
          lastName: 'Schwarzenegger',
          gender: 'Male',
          parentId: 1,
          addresses: [{
            street: 'Arnoldlane 12',
            city: 'Arnoldova',
            zipCode: '123456',
          }],
        },
        {
          age: 98,
          firstName: 'Gustav',
          lastName: 'Schwarzenegger',
          gender: 'Male',
          parentId: null,
          addresses: [{
            street: 'Gustavroad 64',
            city: 'Gustavia',
            zipCode: '654321',
          }],
        },
        {
          age: 45,
          firstName: 'Michael',
          lastName: 'Biehn',
          gender: 'Male',
          parentId: null,
          addresses: null,
        },
        {
          age: 20,
          firstName: 'Some',
          lastName: 'Random-Dudette',
          gender: 'Female',
          parentId: null,
          addresses: null,
        },
      ]);
    }));


    it('`people` field should have all properties defined in the Person model\'s jsonSchema, plus virtual properties', () => graphql(schema, '{ people { age, birthYear, gender, firstName, lastName, parentId, addresses { street, city, zipCode } } }').then((res) => {
      // console.log(res);
      const { data: { people } } = res;
      people.sort(sortByFirstName);

      expect(people).to.eql([
        {
          age: 73,
          birthYear: 1945,
          firstName: 'Arnold',
          lastName: 'Schwarzenegger',
          gender: 'Male',
          parentId: 1,
          addresses: [{
            street: 'Arnoldlane 12',
            city: 'Arnoldova',
            zipCode: '123456',
          }],
        },
        {
          age: 98,
          birthYear: 1920,
          firstName: 'Gustav',
          lastName: 'Schwarzenegger',
          gender: 'Male',
          parentId: null,
          addresses: [{
            street: 'Gustavroad 64',
            city: 'Gustavia',
            zipCode: '654321',
          }],
        },
        {
          age: 45,
          birthYear: 1973,
          firstName: 'Michael',
          lastName: 'Biehn',
          gender: 'Male',
          parentId: null,
          addresses: null,
        },
        {
          age: 20,
          birthYear: 1998,
          firstName: 'Some',
          lastName: 'Random-Dudette',
          gender: 'Female',
          parentId: null,
          addresses: null,
        },
      ]);
    }));

    it('should work with the meta field `__typename`', () => graphql(schema, '{ reviews { title, __typename } }').then((res) => {
      expect(res.data.reviews).to.eql([{
        __typename: 'Review',
        title: 'Great movie',
      }, {
        __typename: 'Review',
        title: 'Changed my mind',
      }]);
    }));

    describe('#selectFiltering', () => {
      it('should select all columns for use in virtual attributes when selectFiltering is disabled', () => {
        schema = mainModule
          .builder()
          .model(session.models.Person, { listFieldName: 'people' })
          .model(session.models.Movie)
          .model(session.models.Review)
          .selectFiltering(false)
          .build();

        return graphql(schema, '{ people { firstName, lastName, fullName } }').then((res) => {
          const { data: { people } } = res;
          people.sort(sortByFirstName);

          expect(people).to.eql([
            {
              firstName: 'Arnold',
              lastName: 'Schwarzenegger',
              fullName: 'Arnold Schwarzenegger',
            },
            {
              firstName: 'Gustav',
              lastName: 'Schwarzenegger',
              fullName: 'Gustav Schwarzenegger',
            },
            {
              firstName: 'Michael',
              lastName: 'Biehn',
              fullName: 'Michael Biehn',
            },
            {
              firstName: 'Some',
              lastName: 'Random-Dudette',
              fullName: 'Some Random-Dudette',
            },
          ]);
        });
      });
    });

    describe('#argFactory', () => {
      it('should register custom filter arguments', () => {
        schema = mainModule
          .builder()
          .model(session.models.Person, { listFieldName: 'people' })
          .model(session.models.Movie)
          .model(session.models.Review)
          .argFactory((fields, modelClass) => {
            const args = {};

            _.each(fields, (field, propName) => {
              const columnName = modelClass.propertyNameToColumnName(propName);

              if (field.type instanceof GraphQLObjectType || field.type instanceof GraphQLList) {
                return;
              }

              args[`${propName}EqualsReverse`] = {
                type: field.type,
                query: (query, value) => {
                  query.where(columnName, '=', value.split('').reverse().join(''));
                },
              };
            });

            return args;
          })
          .build();

        return graphql(schema, '{ people(firstNameEqualsReverse: "dlonrA", lastNameEqualsReverse: "reggenezrawhcS") { firstName } }', session.knex).then((res) => {
          expect(res.data.people).to.eql([{
            firstName: 'Arnold',
          }]);
        });
      });
    });

    describe('#defaultArgNames', () => {
      it('should change the names/postfixes of the default arguments', () => {
        schema = mainModule
          .builder()
          .model(session.models.Person, { listFieldName: 'people' })
          .model(session.models.Movie)
          .model(session.models.Review)
          .defaultArgNames({
            eq: '_eq',
            gt: '_gt',
            gte: '_gte',
            lt: '_lt',
            lte: '_lte',
            like: '_like',
            likeNoCase: '_like_no_case',
            in: '_in',
            notIn: '_not_in',
            orderBy: 'order_by',
            orderByDesc: 'order_by_desc',
            range: 'range',
            limit: 'limit',
            offset: 'offset',
          })
          .build();

        return graphql(schema, '{ people(firstName_eq: "Arnold", lastName_in: ["Schwarzenegger", "Random-Dudette"], order_by: age) { firstName } }', session.knex).then((res) => {
          expect(res.data.people).to.eql([{
            firstName: 'Arnold',
          }]);
        });
      });
    });

    describe('relations', () => {
      it('`people` should have all the relations of a Person model', () => graphql(schema, '{ people { firstName, parent { firstName }, children { firstName }, movies { name }, reviews { title } } }').then((res) => {
        const arnold = _.find(res.data.people, { firstName: 'Arnold' });
        arnold.movies.sort(sortByName);

        expect(arnold).to.eql({
          firstName: 'Arnold',
          children: [],
          reviews: [],
          parent: {
            firstName: 'Gustav',
          },
          movies: [
            {
              name: 'Predator',
            },
            {
              name: 'Terminator 2: Judgment Day',
            },
            {
              name: 'The terminator',
            },
          ],
        });
      }));

      it('`movies` should have all the relations of a Movies model', () => graphql(schema, '{ movies { name, releaseDate, actors { firstName }, reviews { title } } }').then((res) => {
        const terminator = _.find(res.data.movies, { name: 'The terminator' });

        expect(terminator).to.eql({
          name: 'The terminator',
          releaseDate: '1984-10-26',
          actors: [{
            firstName: 'Arnold',
          }, {
            firstName: 'Michael',
          }],
          reviews: [{
            title: 'Great movie',
          }, {
            title: 'Changed my mind',
          }],
        });
      }));

      it('`reviews` should have all the relations of a Review model', () => graphql(schema, '{ reviews { title, reviewer { firstName }, movie { name } } }').then((res) => {
        const greatMovie = _.find(res.data.reviews, { title: 'Great movie' });

        expect(greatMovie).to.eql({
          title: 'Great movie',
          reviewer: {
            firstName: 'Some',
          },
          movie: {
            name: 'The terminator',
          },
        });
      }));

      it('should be able to fetch nested relations', () => graphql(schema, '{ movies { name, actors { firstName, movies { name } }, reviews { title, reviewer { firstName } } } }').then((res) => {
        const terminator = _.find(res.data.movies, { name: 'The terminator' });
        terminator.actors.sort(sortByFirstName);
        terminator.actors[0].movies.sort(sortByName);
        terminator.reviews.sort(sortByTitle);

        expect(terminator).to.eql({
          name: 'The terminator',
          actors: [{
            firstName: 'Arnold',

            movies: [
              {
                name: 'Predator',
              },
              {
                name: 'Terminator 2: Judgment Day',
              },
              {
                name: 'The terminator',
              },
            ],
          }, {
            firstName: 'Michael',

            movies: [{
              name: 'The terminator',
            }],
          }],

          reviews: [
            {
              title: 'Changed my mind',

              reviewer: {
                firstName: 'Some',
              },
            },
            {
              title: 'Great movie',

              reviewer: {
                firstName: 'Some',
              },
            },
          ],
        });
      }));

      it('should be able to fetch nested relations using JoinEagerAlgorithm', () => graphql(schema, `{
          movies {
            name,
            actors {
              firstName,
              movies {
                name
              }
            },
            reviews {
              title,
              reviewer {
                firstName
              }
            }
          }
        }`, {
        onQuery(builder) {
          builder.eagerAlgorithm(session.models.Person.JoinEagerAlgorithm);
        },
      }).then((res) => {
        const terminator = _.find(res.data.movies, { name: 'The terminator' });
        terminator.actors.sort(sortByFirstName);
        terminator.actors[0].movies.sort(sortByName);
        terminator.reviews.sort(sortByTitle);

        expect(terminator).to.eql({
          name: 'The terminator',
          actors: [{
            firstName: 'Arnold',

            movies: [{
              name: 'Predator',
            },
            {
              name: 'Terminator 2: Judgment Day',
            },
            {
              name: 'The terminator',
            },
            ],
          }, {
            firstName: 'Michael',

            movies: [{
              name: 'The terminator',
            }],
          }],

          reviews: [
            {
              title: 'Changed my mind',

              reviewer: {
                firstName: 'Some',
              },
            },
            {
              title: 'Great movie',

              reviewer: {
                firstName: 'Some',
              },
            }],
        });
      }));
    });


    describe('arguments', () => {
      it('each property name should work as a `==` filter', () => graphql(schema, '{ people(age: 73) { firstName } }').then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Arnold',
        }]);
      }));

      it('adding \'Gt\' after a property name should create a `>` filter', () => graphql(schema, '{ people(ageGt: 73) { firstName } }').then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Gustav',
        }]);
      }));

      it('adding \'Gte\' after a property name should create a `>=` filter', () => graphql(schema, '{ people(ageGte: 73) { firstName } }').then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Gustav',
        }, {
          firstName: 'Arnold',
        }]);
      }));

      it('adding \'Lt\' after a property name should create a `<` filter', () => graphql(schema, '{ people(ageLt: 73) { firstName } }').then((res) => {
        const { data: { people } } = res;
        people.sort(sortByFirstName);

        expect(people).to.eql([{
          firstName: 'Michael',
        }, {
          firstName: 'Some',
        }]);
      }));

      it('adding \'Lte\' after a property name should create a `<=` filter', () => graphql(schema, '{ people(ageLte: 73) { firstName } }').then((res) => {
        const { data: { people } } = res;
        people.sort(sortByFirstName);

        expect(people).to.eql([
          {
            firstName: 'Arnold',
          },
          {
            firstName: 'Michael',
          },
          {
            firstName: 'Some',
          },
        ]);
      }));

      it('adding \'Like\' after a property name should create a `like` filter', () => graphql(schema, '{ people(lastNameLike: "%egg%") { firstName } }').then((res) => {
        const { data: { people } } = res;
        people.sort(sortByFirstName);

        expect(people).to.eql([
          {
            firstName: 'Arnold',
          },
          {
            firstName: 'Gustav',
          },
        ]);
      }));

      it('adding \'LikeNoCase\' after a property name should create a case insensitive `like` filter', () => graphql(schema, '{ people(lastNameLikeNoCase: "sch%") { firstName } }').then((res) => {
        const { data: { people } } = res;
        people.sort(sortByFirstName);

        expect(people).to.eql([
          {
            firstName: 'Arnold',
          },
          {
            firstName: 'Gustav',
          },
        ]);
      }));

      it('adding \'In\' after a property name should create an `in` filter', () => graphql(schema, '{ people(ageIn: [45, 98]) { firstName } }').then((res) => {
        const { data: { people } } = res;
        people.sort(sortByFirstName);

        expect(people).to.eql([{
          firstName: 'Gustav',
        }, {
          firstName: 'Michael',
        }]);
      }));

      it('adding \'NotIn\' after a property name should create an `not in` filter', () => graphql(schema, '{ people(ageNotIn: [45, 98]) { firstName } }').then((res) => {
        const { data: { people } } = res;
        people.sort(sortByFirstName);

        expect(res.data.people).to.eql([
          {
            firstName: 'Arnold',
          },
          {
            firstName: 'Some',
          }]);
      }));

      it('adding \'IsNull: true\' after a property name should create an `is null` filter', () => graphql(schema, '{ people(parentIdIsNull: true) { firstName } }').then((res) => {
        const { data: { people } } = res;
        people.sort(sortByFirstName);

        expect(people).to.eql([{
          firstName: 'Gustav',
        }, {
          firstName: 'Michael',
        }, {
          firstName: 'Some',
        }]);
      }));

      it('adding \'IsNull: false\' after a property name should create an `not null` filter', () => graphql(schema, '{ people(parentIdIsNull: false) { firstName } }').then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Arnold',
        }]);
      }));

      it('orderBy should order by the given property', () => graphql(schema, '{ people(orderBy: age) { firstName, age } }').then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Some',
          age: 20,
        }, {
          firstName: 'Michael',
          age: 45,
        }, {
          firstName: 'Arnold',
          age: 73,
        }, {
          firstName: 'Gustav',
          age: 98,
        }]);
      }));

      it('orderByDesc should order by the given property in descending order', () => graphql(schema, '{ people(orderByDesc: age) { firstName, age } }').then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Gustav',
          age: 98,
        }, {
          firstName: 'Arnold',
          age: 73,
        }, {
          firstName: 'Michael',
          age: 45,
        }, {
          firstName: 'Some',
          age: 20,
        }]);
      }));

      it('range should select a range', () => graphql(schema, '{ people(range: [1, 2], orderBy: age) { firstName, age } }').then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Michael',
          age: 45,
        }, {
          firstName: 'Arnold',
          age: 73,
        }]);
      }));

      it('limit should limit the records returned', () => graphql(schema, '{ people(limit: 1) { firstName, age} }').then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Gustav',
          age: 98,
        }]);
      }));

      it('offset should offset the point from which the records are returned', () => graphql(schema, '{ people(offset: 3, orderByDesc: firstName) { firstName, age} }').then((res) => {
        expect(res.data.people).to.eql([{
          firstName: 'Arnold',
          age: 73,
        }]);
      }));


      it('jsonSchema enums should be usable as GraphQL enums', () => graphql(schema, '{ people(gender: Male) { firstName } }').then((res) => {
        const { data: { people } } = res;
        people.sort(sortByFirstName);

        expect(people).to.eql([
          {
            firstName: 'Arnold',
          },
          {
            firstName: 'Gustav',
          },
          {
            firstName: 'Michael',
          },
        ]);
      }));

      describe('relations', () => {
        it('relations should take the same arguments as root fields (1)', () => graphql(schema, '{ person(firstName: "Arnold") { movies(releaseDateGt: "1987-01-01", orderBy: releaseDate) { name } } }').then((res) => {
          expect(res.data.person).to.eql({
            movies: [{
              name: 'Predator',
            }, {
              name: 'Terminator 2: Judgment Day',
            }],
          });
        }));

        it('relations should take the same arguments as root fields (2)', () => graphql(schema, '{ person(firstName: "Arnold") { movies(releaseDateGt: "1987-01-01", orderByDesc: releaseDate) { name } } }').then((res) => {
          expect(res.data.person).to.eql({
            movies: [{
              name: 'Terminator 2: Judgment Day',
            }, {
              name: 'Predator',
            }],
          });
        }));

        it('relations should take the same arguments as root fields (3)', () => graphql(schema, '{ person(firstName: "Arnold") { movies(releaseDateLte: "1987-01-01", orderBy: releaseDate) { name } } }').then((res) => {
          expect(res.data.person).to.eql({
            movies: [{
              name: 'The terminator',
            }],
          });
        }));

        it('nested relations should take the same arguments as root fields', () => graphql(schema, '{ person(firstName: "Arnold") { movies(name: "The terminator") { name, actors(firstNameLikeNoCase : "%chae%") { firstName } } } }').then((res) => {
          expect(res.data.person).to.eql({
            movies: [{
              name: 'The terminator',
              actors: [{
                firstName: 'Michael',
              }],
            }],
          });
        }));
      });
    });
  });

  describe('list fields with pagination', () => {
    let schema;

    beforeEach(() => {
      schema = mainModule
        .builder()
        .model(session.models.Person, {listFieldName: 'people'})
        .model(session.models.Movie)
        .model(session.models.Review)
        .setBuilderOptions({ paginated: true })
        .build();
    });

    it('root should have `totalCount` field', () => graphql(schema, '{ people { collection { firstName }, totalCount } }').then((res) => {
      const { data: { people: { totalCount } } } = res;
      expect(totalCount).to.eql(4);
    }));

    it('root should have `people` field', () => graphql(schema, '{ people { collection { firstName } }}').then((res) => {
      const { data: { people: { collection } } } = res;
      collection.sort(sortByFirstName);

      expect(collection).to.eql([
        {
          firstName: 'Arnold',
        },
        {
          firstName: 'Gustav',
        },
        {
          firstName: 'Michael',
        },
        {
          firstName: 'Some',
        },
      ]);
    }));
  });

  describe('single fields', () => {
    let schema;

    before(() => {
      schema = mainModule
        .builder()
        .model(session.models.Person, { listFieldName: 'people' })
        .model(session.models.Movie)
        .model(session.models.Review)
        .build();
    });

    it('root should have `person` field', () => graphql(schema, '{ person(id: 1) { firstName } }').then((res) => {
      expect(res.data.person).to.eql({
        firstName: 'Gustav',
      });
    }));

    it('root should have `movie` field', () => graphql(schema, '{ movie(nameLikeNoCase: "%terminator 2%") { name } }').then((res) => {
      expect(res.data.movie).to.eql({
        name: 'Terminator 2: Judgment Day',
      });
    }));

    it('root should have `review` field', () => graphql(schema, '{ review(id: 1) { title } }').then((res) => {
      expect(res.data.review).to.eql({
        title: 'Great movie',
      });
    }));

    it('single fields should have all the same arguments and relations as the list fields', () => graphql(schema, '{ person(firstName: "Arnold") { movies(name: "The terminator") { name, actors(firstNameLikeNoCase : "%chae%") { firstName } } } }').then((res) => {
      expect(res.data.person).to.eql({
        movies: [{
          name: 'The terminator',
          actors: [{
            firstName: 'Michael',
          }],
        }],
      });
    }));
  });

  describe('Queries with variables', () => {
    let schema;

    before(() => {
      schema = mainModule
        .builder()
        .model(session.models.Person, { listFieldName: 'people' })
        .model(session.models.Movie)
        .model(session.models.Review)
        .build();
    });

    it('variables in queries should be replaced with values before querying', () => {
      const query = `
        query PersonQuery($id: Int, $movie_id: Int) {
          person(id: $id) {
            id
            firstName
            lastName
            movies(id: $movie_id) {
              name
            }
          }
        }`;
      const variableValues = {
        id: 4,
        movie_id: 1,
      };
      return graphql(schema, query, null, null, variableValues).then((res) => {
        expect(res.data.person).to.eql({
          id: 4,
          firstName: 'Arnold',
          lastName: 'Schwarzenegger',
          movies: [
            {
              name: 'The terminator',
            },
          ],
        });
      });
    });

    it('variables in arrays should be replaced with values before querying', () => {
      const query = `
        query PersonQuery($start: Int, $end: Int) {
          people(range: [$start, $end], orderBy: id) {
            id
          }
        }`;

      const variableValues = {
        start: 1,
        end: 2,
      };

      return graphql(schema, query, null, null, variableValues).then((res) => {
        expect(res.data.people).to.eql([{
          id: 2,
        }, {
          id: 3,
        }]);
      });
    });

    it('enum variables should work', () => {
      const query = `
        query PersonQuery($order: PersonPropertiesEnum) {
          people(orderByDesc: $order) {
            id
          }
        }`;

      const variableValues = {
        order: 'id',
      };

      return graphql(schema, query, null, null, variableValues).then((res) => {
        expect(res.data.people).to.eql([{
          id: 4,
        }, {
          id: 3,
        }, {
          id: 2,
        }, {
          id: 1,
        }]);
      });
    });
  });

  describe('Fragment Queries', () => {
    let schema;

    before(() => {
      schema = mainModule
        .builder()
        .model(session.models.Person, { listFieldName: 'people' })
        .model(session.models.Movie)
        .model(session.models.Review)
        .build();
    });

    it('Fragment spreads should be populated', () => {
      const query = `
        query PersonQuery {
          ...PersonQueryFragment
        }
        fragment PersonQueryFragment on Query {
          person(firstName: "Michael") {
            ...PersonFragment
          }
        }
        fragment PersonFragment on Person {
          firstName
          lastName
          movies {
            ...MovieFragment
          }
        }
        fragment MovieFragment on Movie {
          name
          releaseDate
        }`;
      return graphql(schema, query).then((res) => {
        expect(res.data.person).to.eql({
          firstName: 'Michael',
          lastName: 'Biehn',
          movies: [
            {
              name: 'The terminator',
              releaseDate: '1984-10-26',
            },
          ],
        });
      });
    });

    it('Fragment spreads with multiple relations should be correctly resolved', () => {
      const query = `
        query PersonQuery {
          person(id: 4) {
            id
            movies {
              id
            }
            ...PersonFragment
          }
        }
        fragment PersonFragment on Person {
          movies {
            id
          }
          parent {
            id,
            ...ChildrenFragment
          }
        }
        fragment ChildrenFragment on Person {
          children {
            id
          }
        }`;
      return graphql(schema, query).then((res) => {
        expect(res.data.person).to.eql({
          id: 4,
          movies: [
            {
              id: 1,
            },
            {
              id: 2,
            },
            {
              id: 3,
            },
          ],
          parent: {
            id: 1,

            children: [
              {
                id: 4,
              },
            ],
          },
        });
      });
    });
  });

  describe('Schema with mutations', () => {
    let schema;

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
      description: 'Use this object to create new person',
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

    before(() => {
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

      schema = mainModule
        .builder()
        .model(session.models.Person)
        .extendWithMutations(mutationType)
        .build();
    });

    it('allows to add custom mutations type to the schema', () => {
      const query = `
        mutation {
          createPerson(input: {
             firstName: "Jon",
             lastName: "Skeet"
          }) {
             id
          }
      }`;

      return graphql(schema, query).then((res) => {
        expect(res.data.createPerson.id).to.eql(1);
      });
    });
  });

  describe('Schema with mutations', () => {
    let schema;

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
      description: 'Use this object to create new person',
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

    before(() => {
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

      const mutationsBuilder = () => mutationType;

      schema = mainModule
        .builder()
        .model(session.models.Person)
        .extendWithMutations(mutationsBuilder)
        .build();
    });

    it('allows to add custom mutations builder to the schema', () => {
      const query = `
        mutation {
          createPerson(input: {
             firstName: "Jon",
             lastName: "Skeet"
          }) {
             id
          }
      }`;

      return graphql(schema, query).then((res) => {
        expect(res.data.createPerson.id).to.eql(1);
      });
    });
  });

  describe('Schema with auth middleware', () => {
    let schema;

    before(() => {
      const mutationsBuilder = () => mutationType;

      const authMW = (callback, modelData) => {
        const { modelClass } = modelData;
        return (obj, args, context, info) => {
          if (modelClass.needAuth) { // You can define in model somethig like roles and check it here
            if (!context) { // check your own context property
              throw new Error('Access denied');
            }
          }
          return callback(obj, args, context, info);
        };
      }

      schema = mainModule
        .builder()
        .model(session.models.Person)
        .model(session.models.Movie)
        .extendWithMiddleware(authMW)
        .build();
    });

    it('does not allow to access person entity (needAuth true)', () => {
      const query = `
        query {
          persons {
             firstName
          }
      }`;

      return graphql(schema, query).then((res) => {
        expect(res.errors[0].message).to.eql('Access denied');
      });
    });

    it('allows to access movie entity (needAuth false)', () => {
      const query = `
        query {
          movie(id: 1) {
             name
          }
      }`;

      return graphql(schema, query).then((res) => {
        expect(res.data.movie).to.eql({
          name: 'The terminator',
        });
      });
    });
  });

  describe('builder options', () => {
    let schema;

    before(() => {
      schema = mainModule
        .builder()
        .model(session.models.Person)
        .setBuilderOptions({
          skipUndefined: true,
        })
        .build();
    });

    it('skipUndefined option should allow passing undefined arguments', () => graphql(
      schema,
      'query ($_firstName: String){ person(id: 1, firstName: $_firstName) { firstName } }',
    ).then((res) => {
      expect(res.data.person).to.eql({
        firstName: 'Gustav',
      });
    }));
  });
});
