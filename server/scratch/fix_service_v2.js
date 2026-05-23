const fs = require('fs');
const path = 'c:/Users/AjivaInfotech/Documents/GitHub/currency-exchange/server/Modules/transaction/service.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Add socket import
if (!content.includes('const socket = require("../../common/lib/socket");')) {
  content = content.replace('const consistencyService = require("./consistency.service");', 'const consistencyService = require("./consistency.service");\nconst socket = require("../../common/lib/socket");');
}

// 2. Add transaction_pending emission after Transaction.create
// Target line 1331 approx
const pendingEmitCode = '    socket.emit("transaction_pending", pendingTransaction);';
if (!content.includes(pendingEmitCode)) {
  const pendingRegex = /(const pendingTransaction = await Transaction.create\([\s\S]*?\);)/;
  content = content.replace(pendingRegex, '$1\n    ' + pendingEmitCode);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated service.js with socket logic');
