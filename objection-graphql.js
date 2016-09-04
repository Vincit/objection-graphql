'use strict';

var SchemaBuilder = require('./lib/SchemaBuilder');

module.exports = {
  builder: function () {
    return new SchemaBuilder();
  }
};