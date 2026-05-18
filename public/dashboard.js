(function () {
  const root = document.querySelector('[data-project-slug]');

  if (!root || !window.EventSource) {
    return;
  }

  const projectSlug = root.dataset.projectSlug;
  const selectedTopicId = root.dataset.selectedTopicId;
  const status = document.getElementById('connection-status');
  const phaseBadge = document.getElementById('phase-badge');
  const messageList = document.getElementById('message-list');
  const turnSummary = document.getElementById('turn-summary');
  const participantList = document.getElementById('participant-list');
  const seenMessages = new Set(
    Array.from(document.querySelectorAll('[data-message-id]')).map(
      (element) => element.dataset.messageId,
    ),
  );

  if (!projectSlug || !selectedTopicId) {
    setConnectionState('idle', 'No topic');
    return;
  }

  const source = new EventSource(`/projects/${projectSlug}/events`);

  source.onopen = function () {
    setConnectionState('connected', 'Live');
  };

  source.onerror = function () {
    setConnectionState('disconnected', 'Reconnecting');
  };

  source.addEventListener('message.created', function (event) {
    const payload = parseEvent(event);

    if (!payload || payload.topicId !== selectedTopicId) {
      return;
    }

    appendMessage(payload.message);
  });

  source.addEventListener('turn.changed', function (event) {
    const payload = parseEvent(event);

    if (!payload || payload.topicId !== selectedTopicId) {
      return;
    }

    updateTurn(payload);
  });

  source.addEventListener('topic.phase_changed', function (event) {
    const payload = parseEvent(event);

    if (!payload || payload.topicId !== selectedTopicId || !phaseBadge) {
      return;
    }

    phaseBadge.textContent = payload.phase;
  });

  source.addEventListener('participant.joined', function () {
    window.location.reload();
  });

  function appendMessage(message) {
    if (!message || seenMessages.has(message.id) || !messageList) {
      return;
    }

    seenMessages.add(message.id);
    document.getElementById('empty-messages')?.remove();

    const card = document.createElement('article');
    card.className = 'message-card';
    card.dataset.messageId = message.id;

    const header = document.createElement('header');
    const speaker = document.createElement('strong');
    const meta = document.createElement('span');
    const content = document.createElement('p');

    speaker.textContent = message.displayName;
    meta.textContent = `Turn ${message.turnIndex} / ${message.phase}`;
    content.textContent = message.content;

    header.append(speaker, meta);
    card.append(header, content);
    messageList.append(card);
    messageList.scrollTop = messageList.scrollHeight;
  }

  function updateTurn(payload) {
    if (turnSummary) {
      turnSummary.innerHTML = '';
      turnSummary.append(
        `Turn ${payload.turnIndex} / Round ${payload.roundIndex}: `,
      );

      const current = document.createElement('strong');
      current.textContent = payload.currentParticipant.displayName;
      turnSummary.append(current);
    }

    if (!participantList) {
      return;
    }

    for (const row of participantList.querySelectorAll('[data-participant-id]')) {
      row.classList.toggle(
        'is-current',
        row.dataset.participantId === payload.currentParticipant.id,
      );
    }
  }

  function setConnectionState(state, label) {
    if (!status) {
      return;
    }

    status.dataset.state = state;
    status.textContent = label;
  }

  function parseEvent(event) {
    try {
      return JSON.parse(event.data);
    } catch {
      return null;
    }
  }
})();
