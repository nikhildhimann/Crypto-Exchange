const fs = require('fs');
const path = require('path');

const srcDir = path.join('c:', 'GitHub', 'wallet', 'src');
const componentsDir = path.join(srcDir, 'components');

const subfolders = ["auth", "dashboard", "portfolio", "transactions", "settings", "dapps"];

subfolders.forEach(folder => {
  const folderPath = path.join(componentsDir, folder);
  if (!fs.existsSync(folderPath)) return;

  const files = fs.readdirSync(folderPath);
  files.forEach(file => {
    if (!file.endsWith('.js')) return;
    const filePath = path.join(folderPath, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Fix sibling components turned into parent siblings
    // Replace import ... from "./SomeComponent" 
    // BUT ONLY IF SomeComponent was moved to a DIFFERENT folder or stayed in components/
    // This is getting complex. Let's stick to the obvious ones first.
    
    // 1. UI folder is now a sibling of the current folder
    content = content.replace(/from (["'])\.\/ui\//g, 'from $1../ui/');
    // Also without trailing slash if used
    content = content.replace(/from (["'])\.\/ui(["'])/g, 'from $1../ui$2');

    // 2. routes.js is now a sibling of the current folder (one level up)
    content = content.replace(/from (["'])\.\/routes(["'])/g, 'from $1../routes$2');

    // 3. AppContext is already fixed by the previous script (usually)
    
    fs.writeFileSync(filePath, content);
  });
});

console.log('Imports fixed');
