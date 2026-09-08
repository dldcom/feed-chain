import { useCallback, useEffect, useMemo, useState } from "react";
import { GAME_MODE_IDS, SPECIES, isPlayableSpeciesId, modeConfig, type GameModeId, type PlayableSpeciesId, type SpeciesId } from "@feed-chain/shared";
import { PixelSpeciesIcon } from "../components/PixelSpeciesIcon";
import { RoleAssignmentModal } from "../components/RoleAssignmentModal";
import { downloadClassResult, leaveClass, sendTeacherCommand } from "../network/gameClient";
import { useGameStore } from "../store/gameStore";

type RoleModalAnchor = { x: number; y: number };

function publicJoinUrl(roomCode: string): string {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  const base = configured || window.location.origin;
  return `${base}/?room=${encodeURIComponent(roomCode)}`;
}

export function TeacherLobbyScreen(): JSX.Element {
  const snapshot = useGameStore((state) => state.snapshot);
  const assignments = useGameStore((state) => state.teacherAssignments);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [roleModalPlayerId, setRoleModalPlayerId] = useState<string | null>(null);
  const [roleModalAnchor, setRoleModalAnchor] = useState<RoleModalAnchor | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameModeId>("chain_observe");
  const [removedSpecies, setRemovedSpecies] = useState<SpeciesId>("frog");
  const [qrExpanded, setQrExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const joinUrl = publicJoinUrl(snapshot.roomCode);
  const roleModalPlayer = snapshot.players.find((player) => player.id === roleModalPlayerId);
  const selectedModeConfig = modeConfig(selectedMode, selectedMode === "web_removal" ? removedSpecies : undefined);
  const assignmentById = useMemo(() => new Map(assignments.map((assignment) => [assignment.playerId, assignment.species])), [assignments]);
  const playableForMode = useMemo(() => new Set(selectedModeConfig.playableSpecies), [selectedModeConfig]);
  const closeRoleModal = useCallback(() => {
    setRoleModalPlayerId(null);
    setRoleModalAnchor(null);
  }, []);

  useEffect(() => {
    if (snapshot.phase === "role_reveal" || (roleModalPlayerId && !snapshot.players.some((player) => player.id === roleModalPlayerId))) {
      closeRoleModal();
    }
  }, [closeRoleModal, roleModalPlayerId, snapshot.phase, snapshot.players]);

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const assignMode = (): void => {
    sendTeacherCommand({
      action: "start_mode",
      modeId: selectedMode,
      ...(selectedMode === "web_removal" ? { removedSpecies } : {}),
    });
  };

  return (
    <>
      <main className="teacher-lobby-screen">
      <header className="teacher-lobby-header">
        <div>
          <small>FEED CHAIN · TEACHER CAMP</small>
          <h1>생태 탐험 대기실</h1>
        </div>
        <div className="teacher-lobby-phase">
          <span>{snapshot.phase === "role_reveal" ? "역할 학습 중" : "학생을 기다리는 중"}</span>
          <strong>{snapshot.players.length}명</strong>
        </div>
      </header>

      <section className="teacher-lobby-grid">
        <div className="teacher-share-card">
          <div className="share-card-title"><span>01</span><strong>학생 초대</strong></div>
          <p>아래 코드나 QR을 학생들에게 보여 주세요.</p>
          <div className="class-code-display" aria-label="수업 코드">{snapshot.roomCode || "------"}</div>
          <div className="qr-frame">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(joinUrl)}`}
              alt="학생 입장 QR 코드"
              loading="eager"
            />
            <button type="button" onClick={() => setQrExpanded(true)}>QR 확대</button>
          </div>
          <div className="join-link-row"><span>{joinUrl}</span><button type="button" onClick={() => void copyLink()}>{copied ? "복사됨" : "링크 복사"}</button></div>
          <small className="share-card-note">수업방은 생성 후 24시간 뒤 자동으로 닫혀요.</small>
        </div>

        <div className="teacher-control-card">
          <div className="control-section roster-section">
            <div className="section-heading"><div><span>02</span><strong>학생 대기중</strong></div><b>{snapshot.players.length}명</b></div>
            <div className="teacher-roster">
              {snapshot.players.length ? snapshot.players.map((player) => {
                const speciesId = assignmentById.get(player.id) ?? (isPlayableSpeciesId(player.species) ? player.species : undefined);
                return (
                  <button
                    key={player.id}
                    type="button"
                    className={`${selectedPlayerId === player.id ? "selected" : ""} ${player.connected ? "" : "offline"}`}
                    onClick={(event) => {
                      setSelectedPlayerId(player.id);
                      if (snapshot.phase !== "role_reveal") {
                        setRoleModalPlayerId(player.id);
                        setRoleModalAnchor({ x: event.clientX, y: event.clientY });
                      }
                    }}
                  >
                    {speciesId ? <PixelSpeciesIcon speciesId={speciesId} /> : <span className="roster-question">?</span>}
                    <span>{player.name}</span>
                    {!player.connected && <small>연결 대기</small>}
                  </button>
                );
              }) : <p className="empty-roster">학생이 수업 코드로 들어오면 여기에 나타나요.</p>}
            </div>
          </div>

          <div className="control-section mode-section">
            <div className="section-heading"><div><span>03</span><strong>게임 모드 선택</strong></div></div>
            <div className="teacher-mode-grid">
              {GAME_MODE_IDS.map((modeId) => {
                const config = modeConfig(modeId);
                return <button key={modeId} type="button" className={selectedMode === modeId ? "active" : ""} disabled={snapshot.phase === "role_reveal"} onClick={() => setSelectedMode(modeId)}><b>{config.number}</b><span>{config.title}</span><small>{config.durationMs / 60000}분 · {config.kind === "chain" ? "사슬" : "그물"}</small></button>;
              })}
            </div>
            {selectedMode === "web_removal" && (
              <div className="teacher-removal-picker"><small>사라질 종</small><div>{modeConfig("web_removal").activeSpecies.map((speciesId) => <button key={speciesId} type="button" className={removedSpecies === speciesId ? "active" : ""} onClick={() => setRemovedSpecies(speciesId)}><PixelSpeciesIcon speciesId={speciesId} /><span>{SPECIES[speciesId].name}</span></button>)}</div></div>
            )}
            <div className="teacher-mode-actions">
              <button type="button" className="teacher-secondary-action" disabled={!snapshot.players.length || snapshot.phase === "role_reveal"} onClick={() => sendTeacherCommand({ action: "assign_roles", modeId: selectedMode, ...(selectedMode === "web_removal" ? { removedSpecies } : {}) })}>자동 배정하기</button>
              <button type="button" className="teacher-start-action" disabled={!snapshot.players.length || snapshot.phase === "role_reveal"} onClick={assignMode}>게임 시작</button>
            </div>
            <small className="teacher-secret-note">역할 배정은 학생에게 공개되지 않으며, 게임 시작 후 각자에게만 안내됩니다.</small>
          </div>
        </div>
      </section>

      <footer className="teacher-lobby-footer">
        <button type="button" onClick={downloadClassResult}>기록 저장</button>
        <button type="button" onClick={() => void leaveClass()}>수업방 닫기</button>
      </footer>

      {qrExpanded && <div className="qr-modal" role="dialog" aria-modal="true" onClick={() => setQrExpanded(false)}><div onClick={(event) => event.stopPropagation()}><img src={`https://api.qrserver.com/v1/create-qr-code/?size=720x720&margin=12&data=${encodeURIComponent(joinUrl)}`} alt="확대된 학생 입장 QR 코드" /><strong>{snapshot.roomCode}</strong><button type="button" onClick={() => setQrExpanded(false)}>닫기</button></div></div>}
    </main>
    {roleModalPlayer && roleModalAnchor && snapshot.phase !== "role_reveal" && (
      <RoleAssignmentModal
        player={roleModalPlayer}
        assignedSpecies={assignmentById.get(roleModalPlayer.id)}
        playableSpecies={playableForMode}
        anchor={roleModalAnchor}
        onAssign={(species: PlayableSpeciesId) => sendTeacherCommand({ action: "set_role", playerId: roleModalPlayer.id, species })}
        onClose={closeRoleModal}
      />
    )}
    </>
  );
}
