const xtzAdapter = require('./Modules/chainAdapters/xtz');
const { validateAdapterRegistration } = require('./Modules/chainAdapters/contract');

try {
  validateAdapterRegistration(xtzAdapter);
  console.log('Adapter is valid');
} catch (error) {
  console.error('Validation failed:', error.message);
  process.exit(1);
}
