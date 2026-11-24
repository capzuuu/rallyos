export function buildBracketMatches(format, participants, startDate, courtIds = []) {
  const seeded = [...(participants || [])].sort(
    (a, b) => (a.seed || 99) - (b.seed || 99)
  )
  const names = seeded.map((p) => p.name).filter(Boolean)
  if (names.length < 2) {
    return []
  }

  if (format === 'Round Robin') {
    const rr = []
    let mNum = 1
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const hour = 9 + ((mNum - 1) % 8)
        const cId =
          courtIds.length > 0
            ? courtIds[(mNum - 1) % courtIds.length]
            : null
        rr.push({
          id: `M-${mNum}`,
          match_number: mNum,
          bracket_section: 'Round Robin',
          round_num:
            Math.floor((mNum - 1) / Math.max(1, Math.floor(names.length / 2))) +
            1,
          round_name: `Pool Play • Match ${mNum}`,
          team_a: names[i],
          team_b: names[j],
          score_a: 0,
          score_b: 0,
          winner: null,
          court_id: cId,
          scheduled_date: startDate,
          start_time: `${String(hour).padStart(2, '0')}:00`,
          status: 'Upcoming',
        })
        mNum += 1
      }
    }
    return rr
  }

  const size = names.length <= 4 ? 4 : 8
  while (names.length < size) {
    names.push(`BYE / Seed ${names.length + 1}`)
  }

  if (size === 4) {
    const base = [
      {
        id: 'M-1',
        match_number: 1,
        bracket_section: 'Winners Bracket',
        round_num: 1,
        round_name: 'Semifinals',
        team_a: names[0],
        team_b: names[3],
        score_a: 0,
        score_b: 0,
        winner: null,
        court_id: courtIds[0] || null,
        scheduled_date: startDate,
        start_time: '09:00',
        status: 'Upcoming',
        next_win_match_id: 'M-3',
        next_win_slot: 'A',
        next_loss_match_id: format === 'Double Elimination' ? 'M-4' : null,
        next_loss_slot: 'A',
      },
      {
        id: 'M-2',
        match_number: 2,
        bracket_section: 'Winners Bracket',
        round_num: 1,
        round_name: 'Semifinals',
        team_a: names[1],
        team_b: names[2],
        score_a: 0,
        score_b: 0,
        winner: null,
        court_id: courtIds.length > 0 ? courtIds[1 % courtIds.length] : null,
        scheduled_date: startDate,
        start_time: '10:00',
        status: 'Upcoming',
        next_win_match_id: 'M-3',
        next_win_slot: 'B',
        next_loss_match_id: format === 'Double Elimination' ? 'M-4' : null,
        next_loss_slot: 'B',
      },
      {
        id: 'M-3',
        match_number: 3,
        bracket_section: 'Winners Bracket',
        round_num: 2,
        round_name: 'Championship Final',
        team_a: 'Winner M-1',
        team_b: 'Winner M-2',
        score_a: 0,
        score_b: 0,
        winner: null,
        court_id: courtIds[0] || null,
        scheduled_date: startDate,
        start_time: '13:00',
        status: 'Upcoming',
        next_win_match_id: format === 'Double Elimination' ? 'M-5' : null,
        next_win_slot: 'A',
      },
    ]

    if (format === 'Double Elimination') {
      base.push(
        {
          id: 'M-4',
          match_number: 4,
          bracket_section: 'Losers Bracket',
          round_num: 1,
          round_name: 'Elimination Round 1',
          team_a: 'Loser M-1',
          team_b: 'Loser M-2',
          score_a: 0,
          score_b: 0,
          winner: null,
          court_id: courtIds.length > 0 ? courtIds[1 % courtIds.length] : null,
          scheduled_date: startDate,
          start_time: '11:30',
          status: 'Upcoming',
          next_win_match_id: 'M-5',
          next_win_slot: 'B',
        },
        {
          id: 'M-5',
          match_number: 5,
          bracket_section: 'Grand Final',
          round_num: 3,
          round_name: 'Grand Final',
          team_a: 'Winner M-3',
          team_b: 'Winner M-4',
          score_a: 0,
          score_b: 0,
          winner: null,
          court_id: courtIds[0] || null,
          scheduled_date: startDate,
          start_time: '15:00',
          status: 'Upcoming',
        }
      )
    }
    return base
  }

  const qfPairs = [
    [0, 7],
    [3, 4],
    [1, 6],
    [2, 5],
  ]
  const matches = qfPairs.map(([idxA, idxB], i) => {
    const mNum = i + 1
    return {
      id: `M-${mNum}`,
      match_number: mNum,
      bracket_section: 'Winners Bracket',
      round_num: 1,
      round_name: 'Quarterfinals',
      team_a: names[idxA],
      team_b: names[idxB],
      score_a: 0,
      score_b: 0,
      winner: null,
      court_id:
        courtIds.length > 0 ? courtIds[i % courtIds.length] : null,
      scheduled_date: startDate,
      start_time: `${String(9 + i).padStart(2, '0')}:00`,
      status: 'Upcoming',
      next_win_match_id: i < 2 ? 'M-5' : 'M-6',
      next_win_slot: i % 2 === 0 ? 'A' : 'B',
      next_loss_match_id:
        format === 'Double Elimination' ? (i < 2 ? 'M-8' : 'M-9') : null,
      next_loss_slot: i % 2 === 0 ? 'A' : 'B',
    }
  })

  matches.push(
    {
      id: 'M-5',
      match_number: 5,
      bracket_section: 'Winners Bracket',
      round_num: 2,
      round_name: 'Semifinals',
      team_a: 'Winner M-1',
      team_b: 'Winner M-2',
      score_a: 0,
      score_b: 0,
      winner: null,
      court_id: courtIds[0] || null,
      scheduled_date: startDate,
      start_time: '13:30',
      status: 'Upcoming',
      next_win_match_id: 'M-7',
      next_win_slot: 'A',
    },
    {
      id: 'M-6',
      match_number: 6,
      bracket_section: 'Winners Bracket',
      round_num: 2,
      round_name: 'Semifinals',
      team_a: 'Winner M-3',
      team_b: 'Winner M-4',
      score_a: 0,
      score_b: 0,
      winner: null,
      court_id: courtIds.length > 0 ? courtIds[1 % courtIds.length] : null,
      scheduled_date: startDate,
      start_time: '14:30',
      status: 'Upcoming',
      next_win_match_id: 'M-7',
      next_win_slot: 'B',
    },
    {
      id: 'M-7',
      match_number: 7,
      bracket_section: 'Winners Bracket',
      round_num: 3,
      round_name: 'Championship Final',
      team_a: 'Winner M-5',
      team_b: 'Winner M-6',
      score_a: 0,
      score_b: 0,
      winner: null,
      court_id: courtIds[0] || null,
      scheduled_date: startDate,
      start_time: '16:30',
      status: 'Upcoming',
      next_win_match_id: format === 'Double Elimination' ? 'M-11' : null,
      next_win_slot: 'A',
    }
  )

  return matches
}
