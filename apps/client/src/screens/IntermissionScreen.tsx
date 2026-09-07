export function IntermissionScreen({ title, copy }: { title: string; copy: string }): JSX.Element {
  return <main className="intermission-screen"><div className="intermission-orbit" aria-hidden="true"><span className="intermission-mark" /></div><h1>{title}</h1><p>{copy}</p></main>;
}
