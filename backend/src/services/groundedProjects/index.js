const { serializeProject } = require('./privacy');
const { deriveOperationalPhase, projectSegment } = require('./state');
const {
  requestCompletion,
  confirmCompletion,
  disputeCompletion,
} = require('./commands');

module.exports = {
  serializeProject,
  deriveOperationalPhase,
  projectSegment,
  requestCompletion,
  confirmCompletion,
  disputeCompletion,
};
