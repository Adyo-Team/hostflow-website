"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  PageHeader,
  FilterBar,
  PageLoading,
  Pager,
  StatusBadge,
} from "../ui";
import { EmptyState, Field, FormField } from "../shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Membership } from "@/lib/hostflow/types";
import {
  canReadTasks,
  canManageTasks,
  taskTypes,
  taskStatuses,
  taskPriorities,
  type Task,
  type TaskOptions,
  type TaskList,
} from "@/lib/tasks/types";
import { localDateTime, toInstant } from "@/lib/tasks/dates.mjs";
import { taskRequest, useTaskResource } from "./client";
function Choice({
  label,
  value,
  onChange,
  items,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label} className="w-full h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(items).map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Failure({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div
      role="alert"
      className="hf-error flex flex-wrap gap-3 items-center justify-between"
    >
      <span>{error}</span>
      <Button variant="outline" onClick={retry}>
        Réessayer
      </Button>
    </div>
  );
}
export function TasksModule({ active }: { active?: Membership }) {
  if (!active || !canReadTasks(active.role))
    return (
      <EmptyState
        icon={ClipboardList}
        title="Accès restreint"
        description="Votre rôle ne permet pas de consulter les tâches."
      />
    );
  return <TaskRows active={active} />;
}
export function LinkedTasks({
  active,
  propertyId,
  reservationId,
}: {
  active: Membership;
  propertyId: string;
  reservationId?: string;
}) {
  return (
    <section className="mt-6">
      <TaskRows
        active={active}
        propertyId={propertyId}
        reservationId={reservationId}
        embedded
      />
    </section>
  );
}
function TaskRows({
  active,
  propertyId,
  reservationId,
  embedded = false,
}: {
  active: Membership;
  propertyId?: string;
  reservationId?: string;
  embedded?: boolean;
}) {
  const org = active.organization_id,
    manage = canManageTasks(active.role),
    zone = active.organization?.timezone || "Europe/Brussels";
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(embedded ? "all" : "open"),
    [type, setType] = useState("all"),
    [priority, setPriority] = useState("all"),
    [assignee, setAssignee] = useState("all"),
    [property, setProperty] = useState(propertyId || "all"),
    [period, setPeriod] = useState("all"),
    [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Task | "new" | null>(null),
    [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const options = useTaskResource<TaskOptions>("/options", org);
  const params = new URLSearchParams({
    q: search,
    status,
    type,
    priority,
    assignee,
    period,
    page: String(page),
  });
  if (property !== "all") params.set("property_id", property);
  if (reservationId) params.set("reservation_id", reservationId);
  const list = useTaskResource<TaskList>("?" + params, org);
  const change = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };
  async function updateStatus(task: Task, value: string) {
    if (busy) return;
    setBusy(task.id);
    try {
      await taskRequest("/" + task.id, org, {
        method: "PATCH",
        body: { status: value, version: task.version },
      });
      toast.success("Statut mis à jour.");
      list.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Modification impossible.");
      list.reload();
    } finally {
      setBusy(null);
    }
  }
  const names = new Map(options.data?.properties.map((p) => [p.id, p.name]));
  const members = new Map(
    options.data?.members.map((m) => [
      m.user_id,
      m.display_name + (m.status === "active" ? "" : " (suspendu)"),
    ]),
  );
  const action = manage ? (
    <Button onClick={() => setEditor("new")}>
      <Plus className="size-4" />
      Nouvelle tâche
    </Button>
  ) : null;
  return (
    <>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="hf-panel-title">Tâches liées</h2>
          {action}
        </div>
      ) : (
        <PageHeader
          eyebrow="Opérations"
          title="Tâches"
          description={
            manage
              ? "Organisez les interventions de votre équipe."
              : "Retrouvez les tâches qui vous sont assignées."
          }
          actions={action}
        />
      )}
      <FilterBar className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 items-end">
        <div className="space-y-2">
          <label
            htmlFor={embedded ? "linked-task-search" : "task-search"}
            className="text-sm font-medium"
          >
            Rechercher
          </label>
          <Input
            id={embedded ? "linked-task-search" : "task-search"}
            placeholder="Titre de la tâche"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={150}
          />
        </div>
        <Choice
          label="Statut"
          value={status}
          onChange={change(setStatus)}
          items={{
            all: "Tous les statuts",
            open: "À faire et en cours",
            ...taskStatuses,
          }}
        />
        <Choice
          label="Type"
          value={type}
          onChange={change(setType)}
          items={{ all: "Tous les types", ...taskTypes }}
        />
        <Choice
          label="Priorité"
          value={priority}
          onChange={change(setPriority)}
          items={{ all: "Toutes les priorités", ...taskPriorities }}
        />
        {!propertyId && (
          <Choice
            label="Logement"
            value={property}
            onChange={change(setProperty)}
            items={{ all: "Tous les logements", ...Object.fromEntries(names) }}
          />
        )}
        {manage && (
          <Choice
            label="Responsable"
            value={assignee}
            onChange={change(setAssignee)}
            items={{
              all: "Tous les membres",
              mine: "Mes tâches",
              unassigned: "Non assignées",
              ...Object.fromEntries(members),
            }}
          />
        )}
        <Choice
          label="Échéance"
          value={period}
          onChange={change(setPeriod)}
          items={{
            all: "Toutes les dates",
            overdue: "En retard",
            upcoming: "À venir",
          }}
        />
      </FilterBar>
      {options.error && (
        <Failure error={options.error} retry={options.reload} />
      )}
      {list.error ? (
        <Failure error={list.error} retry={list.reload} />
      ) : list.loading ? (
        <PageLoading header={false} />
      ) : !list.data?.items.length ? (
        <div className="hf-panel">
          <EmptyState
            icon={ClipboardList}
            title="Aucune tâche"
            description="Aucune tâche ne correspond à ces filtres."
          />
        </div>
      ) : (
        <div className="hf-panel divide-y">
          {list.data.items.map((task) => {
            const late =
              ["todo", "in_progress"].includes(task.status) &&
              Date.parse(task.scheduled_at) < Date.now();
            return (
              <article
                key={task.id}
                className="p-5 flex flex-col lg:flex-row gap-5 lg:items-start"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    <h3 className="font-semibold break-words">{task.title}</h3>
                    <StatusBadge
                      tone={
                        task.status === "done"
                          ? "success"
                          : task.status === "in_progress"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {taskStatuses[task.status]}
                    </StatusBadge>
                    <StatusBadge
                      tone={
                        ["high", "urgent"].includes(task.priority)
                          ? "warning"
                          : "neutral"
                      }
                    >
                      {taskPriorities[task.priority]}
                    </StatusBadge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    <span>{taskTypes[task.type]}</span>
                    {manage ? (
                      <Link
                        prefetch={false}
                        href={"/properties/" + task.property_id}
                        className="hf-link"
                      >
                        {names.get(task.property_id) || "Voir le logement"}
                      </Link>
                    ) : (
                      <span>
                        {names.get(task.property_id) || "Logement associé"}
                      </span>
                    )}
                    {task.reservation_id && manage && (
                      <Link
                        prefetch={false}
                        className="hf-link"
                        href={"/reservations/" + task.reservation_id}
                      >
                        Voir la réservation
                      </Link>
                    )}
                  </div>
                  <p className="text-sm">
                    <time dateTime={task.scheduled_at}>
                      {new Date(task.scheduled_at).toLocaleString("fr-FR", {
                        timeZone: zone,
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>{" "}
                    · {zone}
                    {late && (
                      <span className="ml-2 font-semibold text-amber-800">
                        En retard
                      </span>
                    )}
                  </p>
                  <p className="text-sm hf-muted">
                    {task.assignee_id
                      ? members.get(task.assignee_id) ||
                        (task.assignee_id === active.user_id
                          ? "Vous"
                          : "Membre indisponible")
                      : "Non assignée"}
                  </p>
                  {task.description && (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {task.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 items-end lg:w-64 lg:shrink-0">
                  <div className="flex-1 min-w-40">
                    <Choice
                      label="Changer le statut"
                      value={task.status}
                      disabled={
                        !!busy || (!manage && task.status === "cancelled")
                      }
                      onChange={(v) => void updateStatus(task, v)}
                      items={
                        manage || task.status === "cancelled"
                          ? taskStatuses
                          : {
                              todo: "À faire",
                              in_progress: "En cours",
                              done: "Terminée",
                            }
                      }
                    />
                  </div>
                  {manage && (
                    <Button variant="outline" onClick={() => setEditor(task)}>
                      Modifier
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          <Pager
            page={page}
            total={list.data.total}
            setPage={setPage}
            embedded
          />
        </div>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90dvh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {editor === "new" ? "Nouvelle tâche" : "Modifier la tâche"}
            </DialogTitle>
            <DialogDescription>
              Planification dans le fuseau {zone}.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <TaskForm
              key={editor === "new" ? "new" : editor.id}
              active={active}
              task={editor === "new" ? undefined : editor}
              propertyId={propertyId}
              reservationId={reservationId}
              onSaved={() => {
                setEditor(null);
                list.reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function TaskForm({
  active,
  task,
  propertyId,
  reservationId,
  onSaved,
}: {
  active: Membership;
  task?: Task;
  propertyId?: string;
  reservationId?: string;
  onSaved: () => void;
}) {
  const zone = active.organization?.timezone || "Europe/Brussels";
  const [id] = useState(() => task?.id || crypto.randomUUID());
  const [property, setProperty] = useState(
      task?.property_id || propertyId || "",
    ),
    [reservation, setReservation] = useState(
      task?.reservation_id || reservationId || "none",
    ),
    [assignee, setAssignee] = useState(task?.assignee_id || "none"),
    [type, setType] = useState<string>(task?.type || "cleaning"),
    [title, setTitle] = useState(task?.title || ""),
    [description, setDescription] = useState(task?.description || ""),
    [status, setStatus] = useState<string>(task?.status || "todo"),
    [priority, setPriority] = useState<string>(task?.priority || "normal"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const options = useTaskResource<TaskOptions>(
    "/options" + (property ? "?property_id=" + property : ""),
    active.organization_id,
  );
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const scheduled_at = toInstant(String(new FormData(e.currentTarget).get("scheduled_local") || ""), zone);
      await taskRequest(task ? "/" + task.id : "", active.organization_id, {
        method: task ? "PUT" : "POST",
        body: {
          id,
          version: task?.version ?? null,
          property_id: property,
          reservation_id: reservation === "none" ? null : reservation,
          assignee_id: assignee === "none" ? null : assignee,
          type,
          title,
          description: description.trim() || null,
          scheduled_at,
          status,
          priority,
        },
      });
      toast.success(task ? "Tâche modifiée." : "Tâche créée.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  const propertyItems = Object.fromEntries(
    options.data?.properties.map((p) => [p.id, p.name]) || [],
  );
  const reservationItems = {
    none: "Aucune réservation",
    ...Object.fromEntries(
      options.data?.reservations.map((r) => [
        r.id,
        `${r.guest_name} · ${r.check_in} → ${r.check_out}${r.status === "cancelled" ? " (annulée)" : ""}`,
      ]) || [],
    ),
  };
  if (reservation !== "none" && !(reservation in reservationItems))
    Object.assign(reservationItems, { [reservation]: "Réservation liée" });
  const memberItems = {
    none: "Non assignée",
    ...Object.fromEntries(
      options.data?.members
        .filter((m) => m.status === "active" || m.user_id === assignee)
        .map((m) => [
          m.user_id,
          m.display_name + (m.status === "active" ? "" : " (suspendu)"),
        ]) || [],
    ),
  };
  return (
    <form onSubmit={save} className="space-y-5">
      {options.error && (
        <Failure error={options.error} retry={options.reload} />
      )}
      {error && (
        <p role="alert" className="hf-error">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-5 min-w-0">
        <Choice
          label="Logement *"
          value={property}
          onChange={(v) => {
            setProperty(v);
            setReservation("none");
          }}
          items={propertyItems}
          disabled={!!propertyId || options.loading}
        />
        <Choice
          label="Réservation liée"
          value={reservation}
          onChange={setReservation}
          items={reservationItems}
          disabled={!!reservationId || !property || options.loading}
        />
        <Choice
          label="Type de tâche"
          value={type}
          onChange={setType}
          items={taskTypes}
        />
        <Choice
          label="Assigner à"
          value={assignee}
          onChange={setAssignee}
          items={memberItems}
          disabled={options.loading}
        />
        <div className="sm:col-span-2">
          <Field
            label="Titre *"
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={150}
          />
        </div>
        <div className="sm:col-span-2">
          <FormField label="Description" id="task-description">
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={3}
            />
          </FormField>
        </div>
        <Field
          label="Date et heure *"
          id="task-date"
          type="datetime-local"
          required
          name="scheduled_local"
          defaultValue={task ? localDateTime(task.scheduled_at, zone) : ""}
        />
        <Choice
          label="Priorité de la tâche"
          value={priority}
          onChange={setPriority}
          items={taskPriorities}
        />
        <Choice
          label="Statut de la tâche"
          value={status}
          onChange={setStatus}
          items={taskStatuses}
        />
      </fieldset>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={busy || !property || options.loading || !!options.error}
        >
          {busy ? "Enregistrement…" : "Enregistrer la tâche"}
        </Button>
      </div>
    </form>
  );
}
