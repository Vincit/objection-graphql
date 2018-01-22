

const SchemaBuilder = require('./lib/SchemaBuilder');

module.exports = {
  builder() {
    return new SchemaBuilder();
  },
};
