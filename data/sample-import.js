// A deliberately messy file for trying the import checks. Every company here is invented.
// Each row shows one kind of problem: see tests/quality.test.js for what the checks report.
export const SAMPLE_CSV = `name,sector,track,one_liner,owner_notes
Quillbrook,Climate software,intro,Carbon accounting for small manufacturers.,call next week
  Larkspur Bio  ,digital health,launch,Home test kits for iron levels.,
Northwind Freight,Logistics,Intro,Route planning for regional carriers.,
Brightloom,Climate software,intro,Duplicate of a company already in the demo.,
Ember Grid Inc.,Energy,intro,Battery scheduling for small solar farms.,
Ember Grid,Energy,intro,Same company spelled differently.,
,Fintech,intro,A row with no name.,
Halcyon Pay,fintech,sideways,Unknown track value.,
Mossgate,,launch,,
Tessellate,Developer tools,launch,"=HYPERLINK(""http://example.com"",""click"")",
Orchard Ledger,Fintech,launch,Bookkeeping for farm co-operatives.,
`;
