const fs = require('fs');
const path = require('path');

const srcDir = path.join('c:', 'GitHub', 'wallet', 'src');
const componentsDir = path.join(srcDir, 'components');

const folders = {
  auth: ["Splash.js", "Onboarding.js", "Auth.js", "WalletSetup.js", "RestoreWallet.js"],
  dashboard: ["Home.js", "AppLayout.js", "Notifications.js"],
  portfolio: ["Portfolio.js", "LiveMarkets.js", "AssetDetail.js", "BalanceInsights.js"],
  transactions: ["History.js", "Send.js", "Receive.js", "Swap.js", "TransactionDetail.js", "Explorer.js", "Receipt.js", "Scanner.js"],
  settings: ["Settings.js", "SettingsDetail.js"],
  dapps: ["Discover.js", "DAppDetail.js"]
};

// 1. Create folders
Object.keys(folders).forEach(folder => {
  const fPath = path.join(componentsDir, folder);
  if (!fs.existsSync(fPath)) {
    fs.mkdirSync(fPath);
  }
});

let allFilesMoved = {}; // fileName: new folder
Object.keys(folders).forEach(folder => {
  folders[folder].forEach(file => {
    allFilesMoved[file] = folder;
    const oldPath = path.join(componentsDir, file);
    const newPath = path.join(componentsDir, folder, file);
    if (fs.existsSync(oldPath)) {
      // Read content
      let content = fs.readFileSync(oldPath, 'utf8');
      
      // Replace imports
      content = content.replace(/["']\.\.\/contexts\//g, '"../../contexts/');
      content = content.replace(/["']\.\.\/img\//g, '"../../img/');
      content = content.replace(/["']\.\.\/ui\//g, '"../ui/');
      content = content.replace(/["']\.\.\/lib\//g, '"../../lib/');
      
      // Move file
      fs.writeFileSync(newPath, content);
      fs.unlinkSync(oldPath);
    }
  });
});

// 2. Update routes.js
const routesPath = path.join(componentsDir, 'routes.js');
if (fs.existsSync(routesPath)) {
  let routesContent = fs.readFileSync(routesPath, 'utf8');
  Object.keys(allFilesMoved).forEach(file => {
    const componentName = file.replace('.js', '');
    const folder = allFilesMoved[file];
    
    // Replace import { ComponentName } from "./ComponentName";
    // with import { ComponentName } from "./folder/ComponentName";
    const regex = new RegExp(`from (["']).\\/(${componentName})(["'])`, 'g');
    routesContent = routesContent.replace(regex, `from $1./${folder}/$2$3`);
  });
  fs.writeFileSync(routesPath, routesContent);
}

console.log('Migration complete');
