import Panel from '../components/atoms/Panel';
import MainLayout from '../components/templates/MainLayout';

const HomePage = () => (
  <MainLayout
    eyebrow="Starter"
    title="New project"
    subtitle="Vite + Atomic Design skeleton is ready. Add your components here."
  >
    <Panel>
      <p className="helper-text">
        This page is intentionally empty. Create your atoms, molecules, organisms, and templates in their folders, then
        compose your page here.
      </p>
    </Panel>
  </MainLayout>
);

export default HomePage;
