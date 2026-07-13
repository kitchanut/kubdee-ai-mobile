const fs = require('fs');
const path = require('path');
const {
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'kubdee-tiktok-cookie-backup-exclusion';
const PLUGIN_VERSION = '1.0.0';
const BACKUP_RULES_RESOURCE = '@xml/kubdee_backup_rules';
const DATA_EXTRACTION_RULES_RESOURCE = '@xml/kubdee_data_extraction_rules';

// Keep normal app backup enabled, but never transfer authentication material.
// `tiktok-cookies/` is the legacy FileSystem snapshot location. SecureStore's
// encrypted preferences are also device-bound and cannot be decrypted after a
// cloud restore, so app.config disables SecureStore's generated rules and this
// plugin owns both exclusions in one place.
const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="file" path="tiktok-cookies/" />
  <exclude domain="sharedpref" path="SecureStore" />
</full-backup-content>
`;

const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="file" path="tiktok-cookies/" />
    <exclude domain="sharedpref" path="SecureStore" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="file" path="tiktok-cookies/" />
    <exclude domain="sharedpref" path="SecureStore" />
  </device-transfer>
</data-extraction-rules>
`;

function withTikTokCookieBackupExclusion(config) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('AndroidManifest.xml is missing <application>.');
    }

    application.$ = application.$ || {};
    application.$['android:fullBackupContent'] = BACKUP_RULES_RESOURCE;
    application.$['android:dataExtractionRules'] =
      DATA_EXTRACTION_RULES_RESOURCE;

    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDirectory = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml'
      );
      fs.mkdirSync(xmlDirectory, { recursive: true });
      writeFileIfChanged(
        path.join(xmlDirectory, 'kubdee_backup_rules.xml'),
        BACKUP_RULES_XML
      );
      writeFileIfChanged(
        path.join(xmlDirectory, 'kubdee_data_extraction_rules.xml'),
        DATA_EXTRACTION_RULES_XML
      );
      return config;
    },
  ]);

  return config;
}

function writeFileIfChanged(filePath, contents) {
  if (
    fs.existsSync(filePath) &&
    fs.readFileSync(filePath, 'utf8') === contents
  ) {
    return;
  }
  fs.writeFileSync(filePath, contents);
}

module.exports = createRunOncePlugin(
  withTikTokCookieBackupExclusion,
  PLUGIN_NAME,
  PLUGIN_VERSION
);
