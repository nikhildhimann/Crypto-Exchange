const mongoose = require("mongoose");

class ajModel {
  constructor(modelName, schemaDefinition, transformFn = null) {
    this.modelName = modelName;
    this.model = null;
    this.schema = new mongoose.Schema(schemaDefinition, {
      versionKey: false,
      timestamps: true,
      toJSON: {
        transform(doc, ret, options) {
          if (typeof transformFn === "function") {
            return transformFn(ret, options);
          }
          return ret;
        },
      },
    });
  }

  index(fields, options = {}) {
    this.schema.index(fields, options);
    return this;
  }

  method(name, handler) {
    this.schema.methods[name] = handler;
    return this;
  }

  staticMethod(name, handler) {
    this.schema.statics[name] = handler;
    return this;
  }

  getModel() {
    if (!this.model) {
      this.model = mongoose.models[this.modelName] || mongoose.model(this.modelName, this.schema);
    }

    return this.model;
  }
}

module.exports = { ajModel, mongoose };
