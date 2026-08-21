import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/themes.css'
import {ThemeProvider} from './context/ThemeContext'
import {DataProvider} from './context/DataContext'
import {AuthProvider} from './context/AuthContext'
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ThemeProvider><AuthProvider><DataProvider><App/></DataProvider></AuthProvider></ThemeProvider></React.StrictMode>)