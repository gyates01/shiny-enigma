import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import RecipeList from './pages/RecipeList'
import RecipeDetail from './pages/RecipeDetail'
import AddRecipe from './pages/AddRecipe'
import Stats from './pages/Stats'

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/recipes" replace />} />
        <Route path="/recipes" element={<RecipeList />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/add" element={<AddRecipe />} />
        <Route path="/stats" element={<Stats />} />
      </Routes>
    </>
  )
}
