const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const get=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const has=(p,text)=>assert(get(p).includes(text),`${p} is missing ${text}`);
const files={
  'src/api/phase422.ts':['requirePhase422Backend','getAdoptionPreferences','saveAdoptionPreferences','markAdoptionMatchRead','getIncidentReportDetails','getBreedCatalog'],
  'src/screens/Adoption/AdoptionMatchesPanel.tsx':['Adoption matching','My match notifications','Save my preferences','readMatchNotification'],
  'src/screens/Officer/FieldIncidentScreen.tsx':['openReportDetails','getStaffIncidentDetails','reporterName','photoUrl'],
  'src/screens/Surveillance/DiseaseMap.tsx':['incidentPhoto','photoFileId','uploadMediaFile'],
  'src/screens/Profile/UserProfileScreen.tsx':['newPetColor','BreedPicker','applicantName'],
  'src/screens/Profile/OwnedPetPassportScreen.tsx':['editColor','BreedPicker'],
  'src/api/adoption.ts':['doc.sex || petDoc?.sex','petNameSnapshot','listingTitleSnapshot'],
  'src/store/index.ts':['listingTitleSnapshot','petNameSnapshot'],
};
for(const [name,needles] of Object.entries(files))for(const needle of needles)has(name,needle);
let ts;
try{ts=require('typescript');}
catch{throw new Error('TypeScript is not installed. Run npm ci before npm run verify:phase422.');}
let n=0;
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,item.name);
  if(item.isDirectory())walk(full);
  else if(/\.(tsx?|jsx?)$/.test(item.name)){
    const text=fs.readFileSync(full,'utf8');
    const output=ts.transpileModule(text,{fileName:full,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
    const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    assert.equal(errors.length,0,`${item.name} failed to parse: ${errors.map(e=>e.messageText).join('; ')}`);
    n++;
  }
}}
walk(path.join(__dirname,'..','src'));
console.log(`PASS: 4.22.1 mobile feature wiring and ${n} source modules parsed. This does not replace a native device test.`);
