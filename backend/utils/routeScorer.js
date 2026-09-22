/**
 * Centralized Multimodal Route Scoring & Recommendation Engine for NER-Sahayak
 * 
 * Evaluates candidates (ROAD, RAIL + ROAD, WATERWAY + ROAD, AIR + ROAD)
 * using a normalized multi-criteria composite decision model.
 */

function scoreAndRecommendRoutes(routes = {}, options = {}) {
  const {
    cargoType = 'General Cargo',
    weight = 100,
    priority = 'Normal',
    emergencyMode = false
  } = options;

  const isEmergency = emergencyMode || priority === 'Emergency' || priority === 'urgent' || priority === 'emergency';
  const isHighPriority = priority === 'High' || priority === 'high';
  const isHeavy = cargoType === 'Heavy Cargo' || Number(weight) > 5000;
  const isPerishableOrUrgent = cargoType === 'Perishable' || 
                               cargoType === 'Pharmaceutical / Medicine' || 
                               cargoType === 'Emergency Supplies';
  const isHighValue = cargoType === 'High Value';

  // Identify available candidate modes
  const availableModes = Object.keys(routes).filter((m) => routes[m] !== null && routes[m] !== undefined);
  if (availableModes.length === 0) {
    return null;
  }

  // Extract metrics across available candidates for min-max normalization
  const times = availableModes.map((m) => routes[m].etaMinutes || 0);
  const distances = availableModes.map((m) => routes[m].totalKm || 0);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);

  // Base weights prioritizing safety
  let wTime = 0.25;
  let wDist = 0.15;
  let wRisk = 0.60;

  if (isEmergency) {
    wTime = 0.50;
    wDist = 0.10;
    wRisk = 0.40;
  } else if (isHighPriority) {
    wTime = 0.35;
    wDist = 0.15;
    wRisk = 0.50;
  } else if (isHighValue) {
    wTime = 0.20;
    wDist = 0.10;
    wRisk = 0.70;
  }

  const scoredCandidates = availableModes.map((mode) => {
    const r = routes[mode];
    const time = r.etaMinutes || 0;
    const distance = r.totalKm || 0;
    const safety = r.safetyIndex !== undefined ? r.safetyIndex : 90;
    const risk = Math.max(0, 100 - safety);

    // Min-Max normalization into [0, 1] range
    const normTime = maxTime > minTime ? (time - minTime) / (maxTime - minTime) : 0;
    const normDist = maxDistance > minDistance ? (distance - minDistance) / (maxDistance - minDistance) : 0;
    const normRisk = risk / 100;

    let suitabilityAdjustment = 0;
    const transferCount = (r.transfers || []).length;
    suitabilityAdjustment += transferCount * 0.02;

    // Strict safety weighting: heavily penalize hazardous routes (<50% safety) and reward high safety (>90%)
    if (safety < 50) {
      suitabilityAdjustment += 1.50; // Heavy penalty: hazardous corridor
    } else if (safety < 70) {
      suitabilityAdjustment += 0.50;
    } else if (safety >= 90) {
      suitabilityAdjustment -= 0.30; // Safety incentive for 90%+ clear corridors
    }

    if (isHeavy) {
      if (mode === 'air') suitabilityAdjustment += 0.20;
      if (mode === 'waterway') suitabilityAdjustment -= 0.15;
      if (mode === 'railway') suitabilityAdjustment -= 0.10;
    }

    if (isPerishableOrUrgent) {
      if (mode === 'air') suitabilityAdjustment -= 0.30;
      if (mode === 'waterway') suitabilityAdjustment += 0.20;
    }

    const cost = (wTime * normTime) + (wDist * normDist) + (wRisk * normRisk) + suitabilityAdjustment;
    const score = Math.round(Math.max(10, Math.min(99, (1 - cost) * 100)));

    let modeReason = '';
    if (safety >= 90) {
      modeReason = `⭐ Recommended: Highest safety index (${safety}%) with clean corridor integrity.`;
    } else if (safety < 50) {
      modeReason = `⚠️ High Hazard Risk: Low safety index (${safety}%) due to active weather or ground disruptions.`;
    } else {
      modeReason = `Moderate safety corridor (${safety}% safety index).`;
    }

    return {
      mode,
      cost,
      score,
      reason: modeReason,
      route: { ...r, modeReason },
    };
  });

  // Sort candidates by cost ascending (lowest cost = best recommendation)
  scoredCandidates.sort((a, b) => a.cost - b.cost);

  const best = scoredCandidates[0];
  const bestMode = best.mode;
  const bestRoute = routes[bestMode];

  let reason = '';
  if (bestMode === 'air') {
    reason = `⭐ Recommended safest corridor: AIR + ROAD provides top safety index (${bestRoute.safetyIndex}%) and fastest transit time (${Math.floor(bestRoute.etaMinutes / 60)}h ${bestRoute.etaMinutes % 60}m), bypassing ground disruptions.`;
  } else if (bestRoute.safetyIndex < 50) {
    reason = `⚠️ CAUTION: Primary corridor has elevated hazard risk (${bestRoute.safetyIndex}% safety). Recommending safest available alternative: ${bestMode.toUpperCase()} (${bestRoute.totalKm} km, ${bestRoute.safetyIndex}% safety).`;
  } else if (isEmergency) {
    reason = `Emergency priority selected ${bestMode.toUpperCase()} (${bestRoute.totalKm} km, ${Math.floor(bestRoute.etaMinutes / 60)}h ${bestRoute.etaMinutes % 60}m) to minimize transit delay with ${bestRoute.safetyIndex}% corridor safety.`;
  } else if (bestMode === 'railway') {
    reason = `NFR Railway freight corridor selected for superior transport safety (${bestRoute.safetyIndex}%), low disruption vulnerability, and reliable transit schedule.`;
  } else if (bestMode === 'waterway') {
    reason = `Inland Waterway corridor (NW-2/16) selected for stable river freight movement with ${bestRoute.safetyIndex}% route safety index.`;
  } else {
    reason = `Recommended safest road corridor (${bestRoute.totalKm} km) with high corridor integrity (${bestRoute.safetyIndex}% safety index).`;
  }

  // Attach score and reason directly to candidate route objects
  scoredCandidates.forEach((c) => {
    if (routes[c.mode]) {
      routes[c.mode].score = c.score;
      routes[c.mode].modeReason = c.reason;
    }
  });

  return {
    recommendedMode: bestMode,
    recommendationReason: reason,
    score: best.score,
    route: bestRoute,
    rankings: scoredCandidates,
  };
}

module.exports = { scoreAndRecommendRoutes };
