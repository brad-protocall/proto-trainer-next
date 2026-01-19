export default function Home() {
  return (
    <main className="min-h-screen bg-cream-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-navy-900 mb-4">
          Proto Training Guide
        </h1>
        <p className="text-navy-700 mb-8">
          Crisis counselor training simulator - Select your role to get started.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="/supervisor"
            className="block p-6 bg-white rounded-lg border border-navy-200 hover:border-orange-400 transition-colors"
          >
            <h2 className="text-xl font-semibold text-navy-800 mb-2">
              Supervisor Dashboard
            </h2>
            <p className="text-navy-600">
              Create scenarios, manage assignments, and track counselor progress.
            </p>
          </a>
          <a
            href="/counselor"
            className="block p-6 bg-white rounded-lg border border-navy-200 hover:border-orange-400 transition-colors"
          >
            <h2 className="text-xl font-semibold text-navy-800 mb-2">
              Counselor Dashboard
            </h2>
            <p className="text-navy-600">
              View your assignments and complete training exercises.
            </p>
          </a>
        </div>
      </div>
    </main>
  )
}
