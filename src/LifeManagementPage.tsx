import { KanbanBoard } from "@/components/lifeManagement/KanbanBoard";
import { LearnList } from "@/components/lifeManagement/LearnList";
import { PainsList } from "@/components/lifeManagement/PainsList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LifeManagementPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="bg-white/80 border-b border-slate-200 px-6 py-5">
        <h1 className="text-2xl font-bold text-slate-900">Life Management</h1>
        <p className="text-slate-600 mt-0.5">Manage tasks, track pains, and list things to learn</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex justify-center">
        <div className="w-full max-w-6xl">
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.08)] border border-slate-200/80 overflow-hidden">
            <Tabs defaultValue="kanban" className="w-full">
              <div className="px-6 pt-6 pb-2 border-b border-slate-100">
                <TabsList className="w-full max-w-md mx-auto flex h-11 bg-slate-100/80 p-1">
                  <TabsTrigger value="kanban" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    Kanban
                  </TabsTrigger>
                  <TabsTrigger value="pains" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    Pains
                  </TabsTrigger>
                  <TabsTrigger value="learn" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    Things to Learn
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="kanban" className="mt-0 p-6">
                <KanbanBoard />
              </TabsContent>
              <TabsContent value="pains" className="mt-0 p-6">
                <PainsList />
              </TabsContent>
              <TabsContent value="learn" className="mt-0 p-6">
                <LearnList />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
