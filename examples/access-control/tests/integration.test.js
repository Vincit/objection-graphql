const { graphql } = require('graphql');
const schema = require('../src/schema');
const Knex = require('knex');
const knexConfigs = require('../knexfile');

const knexConfig = knexConfigs[process.env.NODE_ENV];

const knex = Knex(knexConfig);


let rootNodeForUser = null;
let runQueryAsUser = null;

describe('User Access Control', () => {
  beforeAll(async () => {
    await knex.migrate.rollback();
    await knex.migrate.latest();
  });
  beforeEach(async () => {
    await knex.seed.run();
    rootNodeForUser = async (username) => {
      const user = await knex('User').select('id').where({ username }).first();
      const context = { userId: user.id, isApiQuery: true };
      return {
        async onQuery(qb) {
          return qb.mergeContext(context);
        },
      };
    };
    runQueryAsUser = async (username, query) => {
      const rootNode = await rootNodeForUser(username);
      return graphql(schema, query, rootNode);
    };
  });

  it('should have our 3 users in the db', async () => {
    const users = await knex('User').select('username', 'password');
    expect(users).toMatchSnapshot();
  });

  describe('Alice', () => {
    it('should be able to fetch users from api', async () => {
      const { data: { users } } = await runQueryAsUser('Alice', '{users { id, username }}');
      expect(users).toMatchSnapshot();
    });

    it('should be not be able to see the passwords of others', async () => {
      const { data: { users } } = await runQueryAsUser('Alice', '{users { id, username, password }}');
      expect(users).toMatchSnapshot();
    });

    it('should be not be able to see the passwords of others', async () => {
      const { data: { users } } = await runQueryAsUser('Alice', '{users { id, username, password }}');
      expect(users).toMatchSnapshot();
    });

    it('should only be able to see their project', async () => {
      const { data: { projects } } = await runQueryAsUser('Alice', '{projects { id, title }}');
      expect(projects).toMatchSnapshot();
    });

    it('should not be able to tunnel through project to see password', async () => {
      const { data: { projects } } = await runQueryAsUser('Alice', '{projects { id, owner { id, username, password }}}');
      expect(projects).toMatchSnapshot();
    });
    it('should not be able to tunnel through user to see project', async () => {
      const { data: { users } } = await runQueryAsUser('Alice', '{users { id, projects { id, title }}}');
      expect(users).toMatchSnapshot();
    });
  });
});
