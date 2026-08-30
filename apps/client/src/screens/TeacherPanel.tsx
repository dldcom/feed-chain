import { useState } from "react";
import { GAME_PHASES, PHASE_LABELS, PLAYABLE_SPECIES, SPECIES, isPlayableSpeciesId } from "@feed-chain/shared";
import { downloadClassResult, leaveClass, sendTeacherCommand } from "../network/gameClient";
import { useGameStore } from "../store/gameStore";

export function TeacherPanel(): JSX.Element {
  const snapshot = useGameStore((state) => state.snapshot);
  const connected = snapshot.players.filter((player) => player.connected).length;
  const canAssign = snapshot.phase === "lobby";
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const selectedPlayer = snapshot.players.find((player) => player.id === selectedPlayerId);
  const attempts = snapshot.players.reduce((sum, player) => sum + player.eatAttempts, 0);
  const successes = snapshot.players.reduce((sum, player) => sum + player.successfulEats, 0);
  const livesEnded = snapshot.players.reduce((sum, player) => sum + player.livesEnded, 0);
  const survivalMs = snapshot.players.reduce((sum, player) => sum + player.survivalMs, 0);

  return (
    <aside className="teacher-console">
      <div className="teacher-console-header">
        <div><small>수업 코드</small><strong>{snapshot.roomCode}</strong></div>
        <span className="connection-pill">● {connected}/23</span>
      </div>
      <div className="phase-track">
        {GAME_PHASES.map((phase) => <i key={phase} className={phase === snapshot.phase ? "active" : ""} title={PHASE_LABELS[phase]} />)}
      </div>
      <strong className="current-phase">{PHASE_LABELS[snapshot.phase]}</strong>

      {snapshot.phase === "lobby" && (
        <div className="player-roster">
          {snapshot.players.length ? snapshot.players.map((player) => (
            <button key={player.id} className={`${player.connected ? "" : "offline"} ${selectedPlayerId === player.id ? "selected" : ""}`} onClick={() => setSelectedPlayerId(player.id)}>
              <span>{isPlayableSpeciesId(player.species) ? SPECIES[player.species].emoji : "❔"}</span>{player.name}
            </button>
          )) : <p>학생들이 코드를 입력하면 이곳에 나타납니다.</p>}
        </div>
      )}

      {canAssign && selectedPlayer && (
        <div className="manual-role-picker">
          <small>{selectedPlayer.name} 역할 직접 선택</small>
          <div>{PLAYABLE_SPECIES.map((species) => (
            <button key={species.id} className={selectedPlayer.species === species.id ? "active" : ""} onClick={() => sendTeacherCommand({ action: "set_role", playerId: selectedPlayer.id, species: species.id })}>{species.emoji}</button>
          ))}</div>
        </div>
      )}

      {snapshot.phase === "experiment_setup" && (
        <div className="species-picker">
          <small>사라질 생물을 선택하세요</small>
          <div>{PLAYABLE_SPECIES.map((species) => (
            <button key={species.id} onClick={() => sendTeacherCommand({ action: "start_experiment", removedSpecies: species.id })}>{species.emoji}<span>{species.name}</span></button>
          ))}</div>
        </div>
      )}

      {(snapshot.phase === "round_1" || snapshot.phase === "round_2" || snapshot.phase === "web_review_1" || snapshot.phase === "web_review_2") && (
        <section className="balance-watch">
          <strong>교사용 밸런스 관찰</strong>
          <div><span>먹기 성공률</span><b>{attempts ? Math.round((successes / attempts) * 100) : 0}%</b></div>
          <div><span>잡힌 횟수</span><b>{livesEnded}회</b></div>
          <div><span>평균 생존</span><b>{livesEnded ? Math.round(survivalMs / livesEnded / 1000) : 0}초</b></div>
          <small>학생 화면에는 표시되지 않는 수업 운영용 기록입니다.</small>
        </section>
      )}

      <div className="teacher-actions">
        {canAssign && <button className="teacher-primary" disabled={!snapshot.players.length} onClick={() => sendTeacherCommand({ action: "assign_roles" })}>🎲 자동 배정하고 공개</button>}
        {canAssign && <button disabled={!snapshot.players.length} onClick={() => sendTeacherCommand({ action: "reveal_roles" })}>👀 현재 역할로 공개</button>}
        {snapshot.phase === "role_reveal" && <button className="teacher-primary" onClick={() => sendTeacherCommand({ action: "next_phase", phase: "round_1" })}>▶ 1판 시작</button>}
        {snapshot.phase === "web_review_1" && <button className="teacher-primary" onClick={() => sendTeacherCommand({ action: "next_phase", phase: "round_2" })}>▶ 2판 시작</button>}
        {snapshot.phase === "web_review_2" && <button className="teacher-primary" onClick={() => sendTeacherCommand({ action: "next_phase", phase: "experiment_setup" })}>🧪 생태계 실험</button>}
        {snapshot.phase === "experiment_b" && <button className="teacher-primary" onClick={() => sendTeacherCommand({ action: "next_phase", phase: "final_results" })}>📊 결과 비교</button>}
        {(snapshot.phase === "round_1" || snapshot.phase === "round_2" || snapshot.phase === "experiment_a") && (
          <>
            <div className="time-adjust"><button onClick={() => sendTeacherCommand({ action: "adjust_time", deltaMs: -30000 })}>−30초</button><button onClick={() => sendTeacherCommand({ action: "adjust_time", deltaMs: 30000 })}>+30초</button></div>
            <button onClick={() => sendTeacherCommand({ action: snapshot.paused ? "resume" : "pause" })}>{snapshot.paused ? "▶ 계속" : "⏸ 잠시 멈춤"}</button>
            <button onClick={() => sendTeacherCommand({
              action: "next_phase",
              phase: snapshot.phase === "round_1" ? "web_review_1" : snapshot.phase === "round_2" ? "web_review_2" : "experiment_b",
            })}>⏭ 현재 활동 마치기</button>
          </>
        )}
        <button onClick={downloadClassResult}>💾 기록 저장</button>
        <button className="quiet-button" onClick={() => void leaveClass()}>나가기</button>
      </div>
    </aside>
  );
}
