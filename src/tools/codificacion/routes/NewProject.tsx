import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/lib/codificacion/projects-repository";

export interface NewProjectProps {
  onCancel: () => void;
  onCreated: (projectId: string) => void;
}

export function NewProject({ onCancel, onCreated }: NewProjectProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      window.alert("El nombre del proyecto es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const project = await createProject({
        name,
        description: description.trim() || undefined,
      });
      onCreated(project.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Button variant="ghost" size="sm" className="mb-2 w-fit gap-2" onClick={onCancel}>
          <ArrowLeft className="size-4" />
          Volver
        </Button>
        <CardTitle>Nuevo proyecto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="name">Nombre *</Label>
          <Input
            id="name"
            className="mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="desc">Descripción</Label>
          <Textarea
            id="desc"
            className="mt-2"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Creando…" : "Crear proyecto"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
