import { BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import CopyButton from "./CopyButton";

export default function NotesViewer({ notes }: { notes: string }) {
  return <section className="card result-card notes-card" aria-labelledby="notes-title">
    <div className="result-heading"><div className="heading-with-icon"><BookOpen size={20} aria-hidden="true" /><h2 id="notes-title">Lecture Notes</h2></div><CopyButton text={notes} label="Copy Notes" /></div>
    <div className="notes-content">
      <ReactMarkdown skipHtml components={{
        h1: ({ children }) => <h3>{children}</h3>,
        h2: ({ children }) => <h3>{children}</h3>,
        h3: ({ children }) => <h4>{children}</h4>,
        // Notes need no remote embeds or active links from untrusted model output.
        img: () => null,
        a: ({ children }) => <span>{children}</span>,
      }}>{notes}</ReactMarkdown>
    </div>
    <div className="notes-footnote">Based on your transcript. Review important details against the recording.</div>
  </section>;
}
