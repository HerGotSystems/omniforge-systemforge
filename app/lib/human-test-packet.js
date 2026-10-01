export const HUMAN_TEST_PACKET_SCHEMA = 'human-test-packet/v1';

export const HUMAN_TEST_MODES = Object.freeze([
  'first_contact','task','break_it','mobile','blind',
  'ux','accessibility','browser','device','release'
]);

export const HUMAN_TEST_PERMISSION_SCOPES = Object.freeze([
  'public_navigation','account_creation','test_account',
  'file_upload','simulated_payment'
]);

const clean = value => String(value ?? '').trim();

export function buildHumanTestPacket(input = {}) {
  const project = input.project || {};
  const test = input.test || {};
  const packet = {
    schema: HUMAN_TEST_PACKET_SCHEMA,
    source: {
      system: clean(input.source?.system || 'omniforge'),
      source_id: clean(input.source?.source_id || '') || null
    },
    project: {
      name: clean(project.name),
      url: clean(project.url),
      description: clean(project.description)
    },
    test: {
      title: clean(test.title || 'Untitled human test'),
      mode: clean(test.mode || 'task'),
      instructions: clean(test.instructions),
      minutes_reward: Number(test.minutes_reward ?? 10),
      max_claims: Number(test.max_claims ?? 1),
      permissions: Array.isArray(test.permissions) && test.permissions.length
        ? [...new Set(test.permissions.map(clean))]
        : ['public_navigation'],
      tasks: Array.isArray(test.tasks)
        ? test.tasks.map(task => ({ prompt: clean(typeof task === 'string' ? task : task?.prompt) }))
        : []
    }
  };
  return validateHumanTestPacket(packet);
}

export function validateHumanTestPacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new Error('packet_required');
  if (packet.schema !== HUMAN_TEST_PACKET_SCHEMA) throw new Error('unsupported_packet_schema');

  const project = packet.project || {};
  if (!clean(project.name) || !clean(project.url)) throw new Error('project_name_and_url_required');

  let parsed;
  try { parsed = new URL(project.url); } catch { throw new Error('invalid_project_url'); }
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error('invalid_project_url_protocol');

  const test = packet.test || {};
  if (!HUMAN_TEST_MODES.includes(test.mode)) throw new Error('invalid_test_mode');

  const minutes = Number(test.minutes_reward);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) throw new Error('minutes_reward_must_be_1_to_240');

  const claims = Number(test.max_claims);
  if (!Number.isInteger(claims) || claims < 1 || claims > 100) throw new Error('max_claims_must_be_1_to_100');

  if (!Array.isArray(test.tasks) || test.tasks.length < 1 || test.tasks.length > 100) {
    throw new Error('tasks_must_contain_1_to_100_items');
  }

  for (let i = 0; i < test.tasks.length; i++) {
    if (!clean(test.tasks[i]?.prompt)) throw new Error(`task_${i + 1}_prompt_required`);
  }

  for (const scope of test.permissions || []) {
    if (!HUMAN_TEST_PERMISSION_SCOPES.includes(scope)) throw new Error(`unsupported_permission:${scope}`);
  }

  return {
    schema: HUMAN_TEST_PACKET_SCHEMA,
    source: {
      system: clean(packet.source?.system || 'omniforge'),
      source_id: clean(packet.source?.source_id || '') || null
    },
    project: {
      name: clean(project.name),
      url: parsed.toString(),
      description: clean(project.description)
    },
    test: {
      title: clean(test.title || 'Untitled human test'),
      mode: clean(test.mode || 'task'),
      instructions: clean(test.instructions),
      minutes_reward: minutes,
      max_claims: claims,
      permissions: [...new Set((test.permissions || ['public_navigation']).map(clean))],
      tasks: test.tasks.map(task => ({ prompt: clean(task.prompt) }))
    }
  };
}

export function reservedHumanTestMinutes(packet) {
  const valid = validateHumanTestPacket(packet);
  return valid.test.minutes_reward * valid.test.max_claims;
}

export function downloadHumanTestPacket(packet, filename = 'human-test-packet.json') {
  const valid = validateHumanTestPacket(packet);
  const blob = new Blob([JSON.stringify(valid, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
