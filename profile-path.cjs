const path=require('node:path');
function profilePath(app){return app.isPackaged?path.join(app.getPath('appData'),'RecordedContentPlatform'):app.getPath('userData');}
module.exports={profilePath};
