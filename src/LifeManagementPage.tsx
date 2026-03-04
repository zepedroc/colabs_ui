import { KanbanBoard } from "@/components/lifeManagement/KanbanBoard";
import { LearnList } from "@/components/lifeManagement/LearnList";
import { PainsList } from "@/components/lifeManagement/PainsList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LifeManagementPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-primary">Life Management</h1>
        <p className="text-gray-600">Manage tasks, track pains, and list things to learn</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <Tabs defaultValue="kanban" className="w-full">
          <TabsList>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="pains">Pains</TabsTrigger>
            <TabsTrigger value="learn">Things to Learn</TabsTrigger>
          </TabsList>
          <TabsContent value="kanban" className="mt-4">
            <KanbanBoard />
          </TabsContent>
          <TabsContent value="pains" className="mt-4">
            <PainsList />
          </TabsContent>
          <TabsContent value="learn" className="mt-4">
            <LearnList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
