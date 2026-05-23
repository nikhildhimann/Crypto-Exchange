const fs = require('fs');
const path = 'c:/Users/AjivaInfotech/Documents/GitHub/currency-exchange/server/Modules/transaction/service.js';
let content = fs.readFileSync(path, 'utf8');

const newFunction = `  buildTransactionTimeFields(source = {}, existing = null) {
    const block_time = normalizeTimestampValue(
      source.block_time || source.chainTimestamp || source.confirmed_at || source.confirmedAt
    );
    const confirmed_at = source.validated
      ? normalizeTimestampValue(source.confirmed_at || source.confirmedAt) || block_time
      : normalizeTimestampValue(existing?.confirmed_at || existing?.confirmedAt);

    return {
      ...(block_time ? { block_time } : {}),
      ...(confirmed_at ? { confirmed_at } : {}),
      chainTimestamp: block_time,
      confirmedAt: confirmed_at,
    };
  }`;

// Use regex to replace the old buildTransactionTimeFields
const regex = /buildTransactionTimeFields[^{]*\{[\s\S]*?\n\s{2}\}/;
content = content.replace(regex, newFunction);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated buildTransactionTimeFields');
