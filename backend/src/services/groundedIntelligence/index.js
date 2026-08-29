const { createAssistedIntakeService } = require('./assistedIntake');
const { createRecommendationService } = require('./recommendations');
const { createLiveStatusService } = require('./liveStatus');
const { recommendationSource, projectSource } = require('./store');

function defaultServices() {
  return Object.freeze({
    assistedIntake: createAssistedIntakeService(),
    recommendations: createRecommendationService({ source: recommendationSource }),
    liveStatus: createLiveStatusService({ projectSource }),
  });
}

module.exports = {
  defaultServices,
  createAssistedIntakeService,
  createRecommendationService,
  createLiveStatusService,
};
