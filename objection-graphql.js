import SchemaBuilder from './lib/SchemaBuilder';
import insertDemoData from './insertDemoData';
import Person from './tests/setup/models/Person';
import Movie from './tests/setup/models/Movie';
import Review from './tests/setup/models/Review';
import Promise from 'bluebird';
import { graphql } from 'graphql';

Promise.coroutine(function* () {
  yield insertDemoData();

  const graphQlSchema = new SchemaBuilder()
    .model(Person)
    .model(Movie)
    .model(Review)
    .build();

  const result = yield graphql(graphQlSchema, `{
    persons(firstName: "Arnold") {
      id,
      firstName,
      movies {
        name,
        actors {
          id
          firstName,
          age
        }
        reviews(stars: 4) {
          title,
          text,
          stars
        }
      }
    }
  }`);

  /*
  const result = yield graphql(graphQlSchema, `{
    person(id: 4) {
      id,
      firstName,
      movies {
        name,
        actors {
          id
          firstName,
          age
        }
        reviews(stars: 4) {
          title,
          text,
          stars
        }
      }
    }
  }`);
  */

  console.log(JSON.stringify(result, null, 2));
})();



