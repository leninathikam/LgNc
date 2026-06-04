import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelPicker({ value, onChange }: Props) {
  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: api.listModels,
  });

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-sm outline-none transition focus:border-accent"
    >
      {models.length === 0 && <option value="">No models</option>}
      {models.map((m) => (
        <option key={m.id} value={m.id} disabled={!m.available}>
          {m.label}
          {m.available ? "" : " (needs setup)"}
        </option>
      ))}
    </select>
  );
}
