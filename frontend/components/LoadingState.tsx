import { LoaderCircle } from "lucide-react";

export default function LoadingState({ text }: { text: string }) {
  return <span className="loading-state" role="status"><LoaderCircle size={17} className="spinner" aria-hidden="true" />{text}</span>;
}
