// Update with your config settings.
const path = require('path')
const os = require('os')

module.exports = {

  development: {
    client: 'sqlite3',
    useNullAsDefault: true,
    connection: {
      filename: path.join(os.tmpdir(), 'objection-graphql-access-control.db'),
    },
  },
};
