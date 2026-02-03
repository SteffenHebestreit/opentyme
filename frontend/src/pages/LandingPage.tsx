/**
 * Landing Page Component
 * Modern futuristic landing page with login/register links
 * Now supports both light and dark themes from AppContext
 */

import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage: React.FC = () => {
  return (
    <div>
      {/* Hero Section */}
      <section className="pt-12 pb-20 px-6 bg-gradient-to-b from-transparent via-purple-50/30 to-purple-50/50 dark:from-transparent dark:via-purple-950/10 dark:to-purple-950/20">
        <div className="container mx-auto text-center">
          <div className="mb-8 inline-block">
            <span className="px-4 py-2 bg-purple-500/10 border border-purple-300 rounded-full text-purple-700 dark:text-purple-300 text-sm font-semibold">
              ✨ Your Freelance Finance Hub
            </span>
          </div>
          <h1 className="text-6xl md:text-7xl font-bold mb-6 text-gray-900 dark:bg-gradient-to-r dark:from-purple-200 dark:via-pink-200 dark:to-purple-200 dark:bg-clip-text dark:text-transparent leading-tight">
            <span className="bg-gradient-to-br from-purple-500 via-purple-400 to-purple-300 bg-clip-text text-transparent">T</span>rack <span className="bg-gradient-to-br from-purple-500 via-purple-400 to-purple-300 bg-clip-text text-transparent">Y</span>our <span className="bg-gradient-to-br from-purple-500 via-purple-400 to-purple-300 bg-clip-text text-transparent">M</span>oney & <span className="bg-gradient-to-br from-purple-500 via-purple-400 to-purple-300 bg-clip-text text-transparent">E</span>ffort
          </h1>
          <p className="text-xl text-gray-700 dark:text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
            Streamline your freelance finances with intelligent time tracking, invoice generation, 
            and expense management. Built for freelancers and contractors who value their time.
          </p>
          <div className="flex items-center justify-center space-x-6">
            <Link
              to="/register"
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl font-bold text-lg text-white transition-all transform hover:scale-105 shadow-2xl shadow-purple-500/50"
            >
              Get Started
            </Link>
            <a
              href="#features"
              className="px-8 py-4 border-2 border-purple-300 hover:border-purple-400 rounded-xl font-bold text-lg transition-all hover:bg-purple-500/10"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Dashboard Preview Section */}
      <section className="py-20 px-6 bg-gradient-to-b from-purple-50/50 via-purple-50/30 to-transparent dark:from-purple-950/20 dark:via-purple-950/10 dark:to-transparent">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-5xl font-bold mb-4 text-gray-900 dark:bg-gradient-to-r dark:from-purple-200 dark:to-pink-200 dark:bg-clip-text dark:text-transparent">
              Beautiful Insights at a Glance
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">Your financial overview, simplified and elegant</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Revenue Chart Preview */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:shadow-2xl hover:shadow-purple-500/20">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Revenue Overview</h3>
                <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-semibold">+24%</span>
              </div>
              <div className="relative h-64">
                {/* Simple Chart Visualization */}
                <svg className="w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.5"/>
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.05"/>
                    </linearGradient>
                  </defs>
                  <path
                    d="M 0 180 L 50 150 L 100 140 L 150 120 L 200 100 L 250 90 L 300 70 L 350 50 L 400 40 L 400 200 L 0 200 Z"
                    fill="url(#chartGradient)"
                    className="transition-all duration-500 group-hover:opacity-80"
                  />
                  <path
                    d="M 0 180 L 50 150 L 100 140 L 150 120 L 200 100 L 250 90 L 300 70 L 350 50 L 400 40"
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="3"
                    className="transition-all duration-500 group-hover:stroke-pink-500"
                  />
                  {/* Data Points */}
                  {[0, 50, 100, 150, 200, 250, 300, 350, 400].map((x, i) => {
                    const yValues = [180, 150, 140, 120, 100, 90, 70, 50, 40];
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={yValues[i]}
                        r="5"
                        fill="#a855f7"
                        className="transition-all duration-500 group-hover:fill-pink-500 group-hover:r-6"
                      />
                    );
                  })}
                </svg>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">This Month</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">$8,420</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Invoiced</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">$12,340</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">$3,920</p>
                </div>
              </div>
            </div>

            {/* Time Tracking Preview */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:shadow-2xl hover:shadow-purple-500/20">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Time Tracking</h3>
                <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-semibold">Active</span>
              </div>
              <div className="space-y-4">
                {/* Active Session */}
                <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-2 border-purple-400/50 dark:border-purple-500/50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900 dark:text-white">Website Redesign</span>
                    <span className="text-purple-600 dark:text-purple-400 font-mono font-bold">2:34:18</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Client: Acme Corp</span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      Running
                    </span>
                  </div>
                </div>

                {/* Recent Sessions */}
                {[
                  { project: 'API Development', client: 'Tech Startup', time: '4:15:32', amount: '$415' },
                  { project: 'Logo Design', client: 'Creative Agency', time: '2:30:00', amount: '$250' },
                  { project: 'Content Writing', client: 'Marketing Co', time: '3:45:12', amount: '$375' }
                ].map((session, i) => (
                  <div key={i} className="p-4 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900 dark:text-white">{session.project}</span>
                      <span className="text-gray-600 dark:text-gray-400 font-mono text-sm">{session.time}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                      <span>Client: {session.client}</span>
                      <span className="text-green-600 dark:text-green-400 font-semibold">{session.amount}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expenses Breakdown */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:shadow-2xl hover:shadow-purple-500/20">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Expense Breakdown</h3>
              <div className="relative">
                {/* Circular Progress Chart */}
                <div className="flex items-center justify-center mb-6">
                  <svg className="w-48 h-48 transform -rotate-90">
                    <circle cx="96" cy="96" r="80" fill="none" stroke="currentColor" strokeWidth="12" className="text-gray-200 dark:text-gray-700"/>
                    <circle cx="96" cy="96" r="80" fill="none" stroke="url(#expenseGradient)" strokeWidth="12" strokeDasharray="502" strokeDashoffset="125" strokeLinecap="round" className="transition-all duration-1000"/>
                    <defs>
                      <linearGradient id="expenseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#a855f7"/>
                        <stop offset="100%" stopColor="#ec4899"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute">
                    <p className="text-4xl font-bold text-gray-900 dark:text-white">75%</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">of budget</p>
                  </div>
                </div>

                {/* Expense Categories */}
                <div className="space-y-3">
                  {[
                    { category: 'Software & Tools', amount: '$850', percentage: 35, color: 'bg-purple-500' },
                    { category: 'Office Supplies', amount: '$320', percentage: 25, color: 'bg-pink-500' },
                    { category: 'Marketing', amount: '$480', percentage: 20, color: 'bg-blue-500' },
                    { category: 'Other', amount: '$150', percentage: 20, color: 'bg-gray-400' }
                  ].map((expense, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{expense.category}</span>
                        <span className="text-sm font-bold text-gray-600 dark:text-gray-400">{expense.amount}</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className={`${expense.color} h-2 rounded-full transition-all duration-1000`} style={{width: `${expense.percentage}%`}}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:shadow-2xl hover:shadow-purple-500/20">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Quick Stats</h3>
              <div className="space-y-6">
                {/* Stat Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl border border-purple-300 dark:border-purple-500/30">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">12</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Active Clients</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-pink-500/10 to-pink-500/5 rounded-xl border border-pink-300 dark:border-pink-500/30">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-pink-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">8</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Open Invoices</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl border border-blue-300 dark:border-blue-500/30">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">156</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Hours This Month</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl border border-green-300 dark:border-green-500/30">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">98%</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Payment Rate</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Recent Activity</p>
                  <div className="space-y-2">
                    {[
                      { action: 'Invoice #1234 paid', time: '2 hours ago', icon: '✓' },
                      { action: 'New project started', time: '5 hours ago', icon: '🚀' },
                      { action: 'Expense added', time: '1 day ago', icon: '📎' }
                    ].map((activity, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">
                          <span className="mr-2">{activity.icon}</span>
                          {activity.action}
                        </span>
                        <span className="text-gray-500 dark:text-gray-500 text-xs">{activity.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 relative z-10">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold mb-4 text-gray-900 dark:bg-gradient-to-r dark:from-purple-200 dark:to-pink-200 dark:bg-clip-text dark:text-transparent">
              Everything You Need
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">Focus on creating. Let OpenTYME handle the admin.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-3">Time & Effort Tracking</h3>
              <p className="text-gray-700 dark:text-gray-400">
                Track your work effortlessly. Start, stop, and organize sessions with precision to ensure you bill every minute.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-3">Invoice & Billing</h3>
              <p className="text-gray-700 dark:text-gray-400">
                Generate professional invoices from tracked time. Automate your billing and get paid faster.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-3">Tax-Ready Finances</h3>
              <p className="text-gray-700 dark:text-gray-400">
                Get instant insights into your income, expenses, and tax liabilities with beautiful, simple reports.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3 a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-3">Client & Project Hub</h3>
              <p className="text-gray-700 dark:text-gray-400">
                Keep all client and project information organized. Track rates, contacts, and communication in one place.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-3">Expense Management</h3>
              <p className="text-gray-700 dark:text-gray-400">
                Organize your business expenses with receipt uploads and tax categorization. Make tax time a breeze.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="group p-8 bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border border-purple-300 dark:border-purple-500/20 rounded-2xl hover:border-purple-500/50 transition-all hover:transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-3">Secure & Private</h3>
              <p className="text-gray-700 dark:text-gray-400">
                Enterprise-grade security with encrypted data. Your financial information is protected with industry-leading standards.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
