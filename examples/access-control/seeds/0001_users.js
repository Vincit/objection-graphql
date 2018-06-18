const { Model } = require('objection');
const { User, Project } = require('../src/models');

exports.seed = async (knex) => {
  Model.knex(knex);
  await User.query().delete();
  await Project.query().delete();
  await User.query().insertGraph([
    {
      id: 1, username: 'Alice', password: 'alice', projects: [{ id: 1, title: 'Project by Alice' }],
    },
    {
      id: 2, username: 'Bob', password: 'bob', projects: [{ id: 2, title: 'Project by Bob' }],
    },
    {
      id: 3, username: 'Eve', password: 'eve', projects: [{ id: 3, title: 'Project by Eve' }],
    },
  ]);
};
