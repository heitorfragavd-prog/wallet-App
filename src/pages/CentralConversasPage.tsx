import React, { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { ConversasSidebarList } from "@/domains/conversas/components/ConversasSidebarList";
import { ConversaThreadView } from "@/domains/conversas/components/ConversaThreadView";
import { ConversaDetailPanel } from "@/domains/conversas/components/ConversaDetailPanel";
import { GerenciarGruposModal } from "@/domains/conversas/components/GerenciarGruposModal";
import { useCentralConversas } from "@/domains/conversas/hooks/useCentralConversas";
import { cn } from "@/lib/utils";

const CentralConversasPage: React.FC = () => {
  const {
    isExecutiveUser,
    loadingThreads,
    loadingMessages,
    sending,
    provisioning,
    confirmingProposalId,
    grupos,
    participantes,
    workspaceMembers,
    threads,
    selectedThreadId,
    setSelectedThreadId,
    activeThread,
    activeParticipants,
    messages,
    attachments,
    proposals,
    fechamentos,
    resolveAttachmentSignedUrl,
    sendMessage,
    confirmOrCancelProposal,
    provisionDefaultGroups,
    upsertGroup,
    upsertParticipant,
    removeParticipant,
  } = useCentralConversas();

  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [showDesktopDetails, setShowDesktopDetails] = useState(true);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manageInitialGroupId, setManageInitialGroupId] = useState<string | null>(null);

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setMobileShowThread(true);
  };

  const handleOpenManageModal = (grupoId?: string) => {
    setManageInitialGroupId(grupoId || null);
    setManageModalOpen(true);
  };

  const handleToggleDetails = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileDetailsOpen((prev) => !prev);
    } else {
      setShowDesktopDetails((prev) => !prev);
    }
  };

  const handleOpenAttachmentUrl = async (storagePath: string) => {
    const signedUrl = await resolveAttachmentSignedUrl(
      storagePath,
      activeThread?.conversation?.id,
    );
    if (signedUrl && typeof window !== "undefined") {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-5.5rem)] min-h-[560px] rounded-2xl border border-border/60 bg-card/40 overflow-hidden shadow-lg flex">
        {/* Coluna 1: Lista de Grupos e Canais Privados */}
        <div
          className={cn(
            "w-full md:w-80 xl:w-88 shrink-0 h-full min-h-0",
            mobileShowThread ? "hidden md:flex md:flex-col" : "flex flex-col",
          )}
        >
          <ConversasSidebarList
            threads={threads}
            selectedThreadId={selectedThreadId}
            onSelectThread={handleSelectThread}
            onOpenManageModal={handleOpenManageModal}
            onProvisionDefaults={() => void provisionDefaultGroups()}
            isExecutiveUser={isExecutiveUser}
            loading={loadingThreads}
            provisioning={provisioning}
          />
        </div>

        {/* Coluna 2: Conversa Ativa */}
        <div
          className={cn(
            "flex-1 min-w-0 h-full min-h-0",
            mobileShowThread ? "flex flex-col" : "hidden md:flex md:flex-col",
          )}
        >
          <ConversaThreadView
            thread={activeThread}
            messages={messages}
            proposals={proposals}
            loadingMessages={loadingMessages}
            sending={sending}
            confirmingProposalId={confirmingProposalId}
            isExecutiveUser={isExecutiveUser}
            onBackMobile={() => setMobileShowThread(false)}
            onToggleInfoPanel={handleToggleDetails}
            onOpenManageModal={handleOpenManageModal}
            onSendMessage={sendMessage}
            onConfirmProposal={confirmOrCancelProposal}
            resolveAttachmentSignedUrl={resolveAttachmentSignedUrl}
          />
        </div>

        {/* Coluna 3: Painel Lateral de Contexto & Auditoria (Desktop lg+) */}
        {showDesktopDetails && (
          <div className="hidden lg:flex lg:w-80 xl:w-88 shrink-0 h-full min-h-0">
            <ConversaDetailPanel
              thread={activeThread}
              participants={activeParticipants}
              attachments={attachments}
              proposals={proposals}
              fechamentos={fechamentos}
              isExecutiveUser={isExecutiveUser}
              onOpenManageModal={handleOpenManageModal}
              onOpenAttachmentUrl={handleOpenAttachmentUrl}
            />
          </div>
        )}
      </div>

      {/* Painel de Contexto em telas menores (Drawer) */}
      <Sheet open={mobileDetailsOpen} onOpenChange={setMobileDetailsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Contexto e Auditoria da Conversa</SheetTitle>
          </SheetHeader>
          <ConversaDetailPanel
            thread={activeThread}
            participants={activeParticipants}
            attachments={attachments}
            proposals={proposals}
            fechamentos={fechamentos}
            isExecutiveUser={isExecutiveUser}
            onOpenManageModal={(id) => {
              setMobileDetailsOpen(false);
              handleOpenManageModal(id);
            }}
            onOpenAttachmentUrl={handleOpenAttachmentUrl}
          />
        </SheetContent>
      </Sheet>

      {/* Modal de Administração de Grupos & Participantes */}
      {isExecutiveUser && (
        <GerenciarGruposModal
          open={manageModalOpen}
          initialGroupId={manageInitialGroupId}
          onOpenChange={setManageModalOpen}
          grupos={grupos}
          participantes={participantes}
          workspaceMembers={workspaceMembers}
          provisioning={provisioning}
          onProvisionDefaults={provisionDefaultGroups}
          onSaveGroup={upsertGroup}
          onSaveParticipant={upsertParticipant}
          onRemoveParticipant={removeParticipant}
        />
      )}
    </DashboardLayout>
  );
};

export default CentralConversasPage;
