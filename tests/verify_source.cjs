// Static checks that do not require an Android emulator or live Appwrite credentials.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');
const sourceRoot = path.join(__dirname, '..');
const all = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (fs.statSync(file).isDirectory()) walk(file);
    else if (/\.[jt]sx?$/.test(file)) all.push(file);
  }
}
walk(path.join(sourceRoot, 'src'));
let diagnostics = [];
for (const file of all) {
  const src = fs.readFileSync(file, 'utf8');
  const parsed = ts.transpileModule(src, { fileName: file, reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } });
  diagnostics.push(...(parsed.diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error));
  const reg = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g;
  let m;
  while ((m = reg.exec(src))) {
    const stem = path.resolve(path.dirname(file), m[1]);
    assert(['.ts','.tsx','.js','.jsx','/index.ts','/index.tsx'].some(ext => fs.existsSync(stem + ext)),
      `Missing import ${m[1]} in ${file}`);
  }
}
assert.strictEqual(diagnostics.length, 0, diagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText, ' ')).join('\n'));
const read = file => fs.readFileSync(path.join(sourceRoot,file), 'utf8');
assert(read('src/screens/Profile/SettingsScreen.tsx').includes('setTheme('));
assert(read('src/screens/Profile/SettingsScreen.tsx').includes('Change profile picture'));
assert(read('src/screens/Profile/SettingsScreen.tsx').includes('Sign out'));
assert(read('src/screens/Surveillance/DiseaseMap.tsx').includes('<FullscreenMap'));
assert(read('src/screens/Officer/FieldIncidentScreen.tsx').includes('<FullscreenMap'));
assert(read('src/screens/Profile/OwnedPetPassportScreen.tsx').includes('ancestryParentId'));
assert(read('src/screens/Profile/UserProfileScreen.tsx').includes('newPetVitalStatus'));
assert(read('src/api/client.ts').includes('actualSize'));
assert(read('src/navigation/OfficerTabNavigator.tsx').includes('name="Settings"'));
assert(read('src/navigation/TabNavigator.tsx').includes('name="Settings"'));
assert(!read('src/screens/Officer/FieldLookupScreen.tsx').includes('onPress={() => logout()}'));
assert(read('src/api/client.ts').includes('EXPO_PUBLIC_APPWRITE_PROJECT_ID'));
console.log(`PASS: ${all.length} modules parse, imports resolve, settings / map / ancestry / upload checks passed.`);
