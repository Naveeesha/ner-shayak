/**
 * Transparent, Explainable Risk-Scoring Engine for NER-LINK
 * Calculates a composite 0-100 risk score with explicit factor attribution.
 */

export function calculateCorridorRisk(roadName = '', weather = null, incidents = [], terrain = {}) {
  let score = 15; // Base regional risk factor
  const factors = [];

  // 1. Weather Impact (Rainfall & Visibility)
  const precip = weather?.precipitation ?? weather?.rain ?? 0; // mm/h
  const wind = weather?.windSpeed ?? 10;
  const condition = (weather?.condition || '').toLowerCase();

  if (precip > 20 || condition.includes('heavy rain') || condition.includes('downpour')) {
    const pts = Math.min(30, Math.round(precip * 1.2) || 25);
    score += pts;
    factors.push({ key: 'rainfall', label: 'Torrential Precipitation', value: `+${pts}`, impact: 'high', desc: `Heavy rainfall (${precip} mm/h) elevates flash flood & mudslide probability` });
  } else if (precip > 5 || condition.includes('rain') || condition.includes('shower')) {
    const pts = 12;
    score += pts;
    factors.push({ key: 'rainfall', label: 'Moderate Rainfall', value: `+${pts}`, impact: 'medium', desc: `Rainfall (${precip} mm/h) reduces road traction on hilly corridors` });
  }

  if (condition.includes('fog') || condition.includes('mist') || wind > 35) {
    const pts = 10;
    score += pts;
    factors.push({ key: 'visibility', label: 'Low Visibility & High Winds', value: `+${pts}`, impact: 'medium', desc: 'Dense fog and strong winds affect mountain pass navigation' });
  }

  // 2. Terrain & Slope Factor (Elevated Landslide Vulnerability in NER)
  const isHillyPass = /NH-?27|NH-?102|NH-?37|NH-?54|NH-?44|shillong|kohima|aizawl|itanagar|silchar/i.test(roadName);
  const slopeDegree = terrain.slope || (isHillyPass ? 18 : 6);

  if (slopeDegree > 15) {
    const pts = 20;
    score += pts;
    factors.push({ key: 'terrain', label: 'Steep Mountain Incline', value: `+${pts}`, impact: 'high', desc: `Slope gradient (${slopeDegree}°) increases landslide susceptibility during monsoon` });
  } else if (slopeDegree > 10) {
    const pts = 10;
    score += pts;
    factors.push({ key: 'terrain', label: 'Rolling Terrain', value: `+${pts}`, impact: 'low', desc: 'Moderate slope gradient requires cautious vehicle speeds' });
  }

  // 3. Active Corridor Incidents & Blockages
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const activeCorridorIncidents = safeIncidents.filter(i => {
    if (!i || i.status === 'resolved') return false;
    const cat = (i.category || '').toLowerCase();
    const roadMatch = i.road && roadName && (i.road.toLowerCase().includes(roadName.toLowerCase()) || roadName.toLowerCase().includes(i.road.toLowerCase()));
    return roadMatch || cat === 'landslide' || cat === 'flood' || cat === 'road_blockage';
  });

  if (activeCorridorIncidents.length > 0) {
    const criticals = activeCorridorIncidents.filter(i => i.severity === 'critical' || i.severity === 'major');
    const pts = criticals.length > 0 ? 30 : 18;
    score += pts;
    const catLabels = activeCorridorIncidents
      .map(i => (i.category || i.road || 'disruption').replace(/_/g, ' '))
      .filter(Boolean)
      .join(', ');

    factors.push({
      key: 'incidents',
      label: 'Active Disruption on Corridor',
      value: `+${pts}`,
      impact: criticals.length > 0 ? 'critical' : 'high',
      desc: `${activeCorridorIncidents.length} active report(s) logged (${catLabels || 'road advisory'})`,
    });
  }

  // Cap score at 100
  const finalScore = Math.min(100, Math.max(0, Math.round(score)));

  let riskLevel = 'Low';
  let badgeColor = '#059669'; // Green
  let badgeBg = '#ecfdf5';

  if (finalScore >= 75) {
    riskLevel = 'Critical';
    badgeColor = '#dc2626'; // Red
    badgeBg = '#fef2f2';
  } else if (finalScore >= 50) {
    riskLevel = 'High';
    badgeColor = '#ea580c'; // Orange
    badgeBg = '#fff7ed';
  } else if (finalScore >= 30) {
    riskLevel = 'Moderate';
    badgeColor = '#d97706'; // Amber
    badgeBg = '#fffbeb';
  }

  const safetyIndex = 100 - finalScore;

  return {
    riskScore: finalScore,
    safetyIndex,
    riskLevel,
    badgeColor,
    badgeBg,
    factors: factors.length > 0 ? factors : [{ key: 'clear', label: 'Clear Transport Corridor', value: '+0', impact: 'low', desc: 'No significant weather or terrain hazards detected' }],
  };
}

export default calculateCorridorRisk;
