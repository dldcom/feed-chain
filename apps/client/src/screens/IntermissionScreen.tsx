export function IntermissionScreen({ icon, title, copy }: { icon: string; title: string; copy: string }): JSX.Element {
  return <main className="intermission-screen"><div className="intermission-orbit"><span>{icon}</span></div><h1>{title}</h1><p>{copy}</p></main>;
}
